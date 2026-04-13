from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from ..models import ScanRecord, DomainWhitelist, DomainBlacklist
from ..core.exceptions import DatabaseError, ModelServiceError, RuleEngineError
from .feature_extractor import FeatureExtractor
from .rule_engine import RuleEngine
from .model_service import ModelService


class Detector:
    """检测服务"""
    
    def __init__(self, db: Session):
        self.db = db
        self.feature_extractor = FeatureExtractor()
        self.rule_engine = RuleEngine(db)
        self.model_service = ModelService(db)
    
    def _check_domain_lists(self, domain: str) -> Optional[Dict[str, Any]]:
        """检查域名黑白名单"""
        try:
            # 检查黑名单
            blacklist = self.db.query(DomainBlacklist).filter(DomainBlacklist.domain == domain).first()
            if blacklist:
                return {
                    'label': 'malicious',
                    'reason': f'域名在黑名单中: {blacklist.reason}'
                }
            
            # 检查白名单
            whitelist = self.db.query(DomainWhitelist).filter(DomainWhitelist.domain == domain).first()
            if whitelist:
                return {
                    'label': 'safe',
                    'reason': f'域名在白名单中: {whitelist.reason}'
                }
            
            return None
        except SQLAlchemyError as e:
            raise DatabaseError(f"查询黑白名单失败: {str(e)}")
    
    def _run_detection_pipeline(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """运行检测流水线"""
        try:
            # 规则引擎检测
            rule_result = self.rule_engine.execute_rules(features)
            rule_score = rule_result['rule_score']
            hit_rules = rule_result['hit_rules']
        except Exception as e:
            raise RuleEngineError(f"规则引擎执行失败: {str(e)}")
        
        try:
            # 模型推理
            model_input = features['model_input']
            model_result = self.model_service.predict(model_input)
        except Exception as e:
            raise ModelServiceError(f"模型推理失败: {str(e)}")
        
        # 融合决策
        fuse_result = self._fuse_decision(rule_score, model_result)
        
        # 生成解释和建议
        explanation = self._generate_explanation(hit_rules, model_result)
        recommendation = self._generate_recommendation(fuse_result['label'], fuse_result['risk_score'])
        
        return {
            'fuse_result': fuse_result,
            'rule_score': rule_score,
            'hit_rules': hit_rules,
            'model_result': model_result,
            'explanation': explanation,
            'recommendation': recommendation
        }
    
    def _build_result(self, domain_list_result: Optional[Dict[str, Any]], pipeline_result: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """构建检测结果"""
        if domain_list_result:
            label = domain_list_result['label']
            risk_score = 100.0 if label == 'malicious' else 0.0
            return {
                'label': label,
                'risk_score': risk_score,
                'rule_score': 0.0,
                'model_safe_prob': 1.0 if label == 'safe' else 0.0,
                'model_suspicious_prob': 0.0,
                'model_malicious_prob': 1.0 if label == 'malicious' else 0.0,
                'hit_rules': [],
                'explanation': domain_list_result['reason'],
                'recommendation': self._generate_recommendation(label, risk_score)
            }
        
        if pipeline_result:
            fuse_result = pipeline_result['fuse_result']
            model_result = pipeline_result['model_result']
            return {
                'label': fuse_result['label'],
                'risk_score': fuse_result['risk_score'],
                'rule_score': pipeline_result['rule_score'],
                'model_safe_prob': model_result['safe_prob'],
                'model_suspicious_prob': model_result['suspicious_prob'],
                'model_malicious_prob': model_result['malicious_prob'],
                'hit_rules': pipeline_result['hit_rules'],
                'explanation': pipeline_result['explanation'],
                'recommendation': pipeline_result['recommendation']
            }
        
        return {
            'label': 'safe',
            'risk_score': 0.0,
            'rule_score': 0.0,
            'model_safe_prob': 1.0,
            'model_suspicious_prob': 0.0,
            'model_malicious_prob': 0.0,
            'hit_rules': [],
            'explanation': '未进行检测',
            'recommendation': '建议：网站安全，可以正常访问。'
        }
    
    def _save_record(self, url: str, domain: str, features: Dict[str, Any], result: Dict[str, Any], source: str) -> ScanRecord:
        """保存扫描记录"""
        try:
            record = ScanRecord(
                url=url,
                domain=domain,
                title=features['raw_features'].get('title'),
                source=source,
                label=result['label'],
                risk_score=result['risk_score'],
                rule_score=result['rule_score'],
                model_safe_prob=result['model_safe_prob'],
                model_suspicious_prob=result['model_suspicious_prob'],
                model_malicious_prob=result['model_malicious_prob'],
                has_password_input=bool(features.get('has_password_input', False)),
                hit_rules_json=result['hit_rules'],
                raw_features_json=features['raw_features'],
                explanation=result['explanation'],
                recommendation=result['recommendation']
            )
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            return record
        except SQLAlchemyError as e:
            self.db.rollback()
            raise DatabaseError(f"保存扫描记录失败: {str(e)}")
    
    def _fuse_decision(self, rule_score: float, model_probs: Dict[str, float]) -> Dict[str, Any]:
        """融合决策"""
        safe_prob = model_probs['safe_prob']
        suspicious_prob = model_probs['suspicious_prob']
        malicious_prob = model_probs['malicious_prob']
        
        # 融合策略
        if rule_score > 70 and malicious_prob > 0.55:
            label = 'malicious'
        elif rule_score > 60 or malicious_prob > 0.70:
            label = 'malicious'
        elif rule_score > 35 or suspicious_prob > 0.50:
            label = 'suspicious'
        else:
            label = 'safe'
        
        # 计算风险分数（0-100）
        # 规则分数占40%，模型分数占60%
        model_score = 0
        if label == 'malicious':
            model_score = malicious_prob * 100
        elif label == 'suspicious':
            model_score = (suspicious_prob + malicious_prob * 0.5) * 100
        else:
            model_score = (1 - safe_prob) * 100
        
        risk_score = (rule_score * 0.4) + (model_score * 0.6)
        risk_score = min(100, max(0, risk_score))
        
        return {
            'label': label,
            'risk_score': risk_score
        }
    
    def _generate_explanation(self, hit_rules: list, model_probs: Dict[str, float]) -> str:
        """生成解释"""
        explanations = []
        
        # 规则命中解释
        matched_rules = [rule for rule in hit_rules if rule['matched']]
        if matched_rules:
            explanations.append(f'命中了{len(matched_rules)}条规则:')
            for rule in matched_rules[:3]:  # 只显示前3条
                explanations.append(f'- {rule["rule_name"]}: {rule["detail"]}')
        
        # 模型预测解释
        explanations.append('模型预测结果:')
        explanations.append(f'- 安全概率: {model_probs["safe_prob"]:.2f}')
        explanations.append(f'- 可疑概率: {model_probs["suspicious_prob"]:.2f}')
        explanations.append(f'- 恶意概率: {model_probs["malicious_prob"]:.2f}')
        
        return '\n'.join(explanations)
    
    def _generate_recommendation(self, label: str, risk_score: float) -> str:
        """生成建议"""
        if label == 'malicious':
            return '建议：不要访问此网站，可能存在钓鱼或恶意行为。'
        elif label == 'suspicious':
            return '建议：谨慎访问，注意保护个人信息，避免输入敏感数据。'
        else:
            return '建议：网站安全，可以正常访问。'
    
    def detect_url(self, url: str, source: str = 'manual') -> Dict[str, Any]:
        """检测URL"""
        # 提取特征
        features = self.feature_extractor.extract_features(url)
        domain = features['domain']
        
        # 检查黑白名单
        domain_list_result = self._check_domain_lists(domain)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            # 保存记录
            record = self._save_record(url, domain, features, result, source)
            result['record_id'] = record.id
            return result
        
        # 运行检测流水线
        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        
        # 保存记录
        record = self._save_record(url, domain, features, result, source)
        result['record_id'] = record.id
        
        return result
    
    def detect_page(self, page_data: Dict[str, Any], source: str = 'plugin') -> Dict[str, Any]:
        """检测页面"""
        url = page_data['url']
        title = page_data['title']
        visible_text = page_data['visible_text']
        button_texts = page_data['button_texts']
        input_labels = page_data['input_labels']
        form_action_domains = page_data['form_action_domains']
        has_password_input = page_data['has_password_input']
        
        # 提取特征
        features = self.feature_extractor.extract_features(
            url, title, visible_text, button_texts, input_labels, form_action_domains, has_password_input
        )
        domain = features['domain']
        
        # 检查黑白名单
        domain_list_result = self._check_domain_lists(domain)
        if domain_list_result:
            result = self._build_result(domain_list_result, None)
            # 保存记录
            record = self._save_record(url, domain, features, result, source)
            result['record_id'] = record.id
            return result
        
        # 运行检测流水线
        pipeline_result = self._run_detection_pipeline(features)
        result = self._build_result(None, pipeline_result)
        
        # 保存记录
        record = self._save_record(url, domain, features, result, source)
        result['record_id'] = record.id
        
        return result
