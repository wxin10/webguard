import re
from urllib.parse import urlparse
from typing import Dict, List, Optional


class FeatureExtractor:
    """特征提取服务"""
    
    @staticmethod
    def extract_domain(url: str) -> str:
        """从URL中提取域名"""
        parsed_url = urlparse(url)
        domain = parsed_url.netloc
        # 移除端口号
        if ':' in domain:
            domain = domain.split(':')[0]
        return domain
    
    @staticmethod
    def normalize_url(url: str) -> str:
        """规范化URL"""
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        return url
    
    @staticmethod
    def clean_text(text: str) -> str:
        """清洗文本"""
        # 移除多余的空白字符
        text = re.sub(r'\s+', ' ', text)
        # 移除HTML标签
        text = re.sub(r'<[^>]+>', '', text)
        return text.strip()
    
    @staticmethod
    def normalize_list(items: List[str]) -> List[str]:
        """规范化列表"""
        return [item.strip() for item in items if item.strip()]
    
    @staticmethod
    def construct_model_input(
        url: str,
        domain: str,
        title: str,
        visible_text: str,
        button_texts: List[str],
        input_labels: List[str],
        form_action_domains: List[str],
        has_password_input: bool
    ) -> str:
        """构造模型输入文本模板"""
        template = f"""
[URL] {url}
[DOMAIN] {domain}
[TITLE] {title}
[TEXT] {visible_text}
[BUTTONS] {', '.join(button_texts)}
[INPUTS] {', '.join(input_labels)}
[FORM_ACTIONS] {', '.join(form_action_domains)}
[PASSWORD] {'yes' if has_password_input else 'no'}
"""
        return template.strip()
    
    @staticmethod
    def extract_features(
        url: str,
        title: Optional[str] = None,
        visible_text: Optional[str] = None,
        button_texts: Optional[List[str]] = None,
        input_labels: Optional[List[str]] = None,
        form_action_domains: Optional[List[str]] = None,
        has_password_input: Optional[bool] = None
    ) -> Dict[str, any]:
        """提取特征"""
        # 规范化输入
        url = FeatureExtractor.normalize_url(url)
        domain = FeatureExtractor.extract_domain(url)
        
        if title:
            title = FeatureExtractor.clean_text(title)
        
        if visible_text:
            visible_text = FeatureExtractor.clean_text(visible_text)
        
        if button_texts:
            button_texts = FeatureExtractor.normalize_list(button_texts)
        else:
            button_texts = []
        
        if input_labels:
            input_labels = FeatureExtractor.normalize_list(input_labels)
        else:
            input_labels = []
        
        if form_action_domains:
            form_action_domains = FeatureExtractor.normalize_list(form_action_domains)
        else:
            form_action_domains = []
        
        # 构造模型输入
        model_input = FeatureExtractor.construct_model_input(
            url, domain, title or '', visible_text or '',
            button_texts, input_labels, form_action_domains,
            has_password_input or False
        )
        
        # 生成原始特征
        raw_features = {
            'url': url,
            'domain': domain,
            'title': title,
            'visible_text': visible_text,
            'button_texts': button_texts,
            'input_labels': input_labels,
            'form_action_domains': form_action_domains,
            'has_password_input': has_password_input
        }
        
        return {
            'domain': domain,
            'model_input': model_input,
            'raw_features': raw_features,
            'has_password_input': has_password_input
        }
