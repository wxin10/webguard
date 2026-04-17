from datetime import datetime, timedelta
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import FeedbackCase, PluginSyncEvent, ScanRecord


class StatsService:
    """统计服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_overview(self) -> Dict[str, Any]:
        """获取概览统计"""
        # 总检测数
        total_scans = self.db.query(func.count(ScanRecord.id)).scalar() or 0
        
        # 各风险等级数量
        safe_count = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'safe').scalar() or 0
        suspicious_count = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'suspicious').scalar() or 0
        malicious_count = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'malicious').scalar() or 0
        
        # 今日检测数
        today = datetime.now().date()
        today_scans = self.db.query(func.count(ScanRecord.id)).filter(
            func.date(ScanRecord.created_at) == today
        ).scalar() or 0
        
        return {
            'total_scans': total_scans,
            'safe_count': safe_count,
            'suspicious_count': suspicious_count,
            'malicious_count': malicious_count,
            'today_scans': today_scans
        }
    
    def get_trend(self, days: int = 7) -> List[Dict[str, Any]]:
        """获取趋势统计"""
        trend = []
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days-1)
        
        current_date = start_date
        while current_date <= end_date:
            # 当天总检测数
            total = self.db.query(func.count(ScanRecord.id)).filter(
                func.date(ScanRecord.created_at) == current_date
            ).scalar() or 0
            
            # 各风险等级数量
            safe = self.db.query(func.count(ScanRecord.id)).filter(
                func.date(ScanRecord.created_at) == current_date,
                ScanRecord.label == 'safe'
            ).scalar() or 0
            
            suspicious = self.db.query(func.count(ScanRecord.id)).filter(
                func.date(ScanRecord.created_at) == current_date,
                ScanRecord.label == 'suspicious'
            ).scalar() or 0
            
            malicious = self.db.query(func.count(ScanRecord.id)).filter(
                func.date(ScanRecord.created_at) == current_date,
                ScanRecord.label == 'malicious'
            ).scalar() or 0
            
            trend.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'count': total,
                'safe_count': safe,
                'suspicious_count': suspicious,
                'malicious_count': malicious
            })
            
            current_date += timedelta(days=1)
        
        return trend
    
    def get_risk_distribution(self) -> Dict[str, Any]:
        """获取风险分布"""
        # 各风险等级数量
        safe = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'safe').scalar() or 0
        suspicious = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'suspicious').scalar() or 0
        malicious = self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == 'malicious').scalar() or 0
        
        total = safe + suspicious + malicious
        distribution = {}
        if total > 0:
            distribution['safe'] = safe / total * 100
            distribution['suspicious'] = suspicious / total * 100
            distribution['malicious'] = malicious / total * 100
        else:
            distribution['safe'] = 0
            distribution['suspicious'] = 0
            distribution['malicious'] = 0
        
        return {
            'safe': safe,
            'suspicious': suspicious,
            'malicious': malicious,
            'distribution': distribution
        }

    def get_source_distribution(self) -> Dict[str, int]:
        rows = self.db.query(ScanRecord.source, func.count(ScanRecord.id)).group_by(ScanRecord.source).all()
        return {source or "unknown": int(count) for source, count in rows}

    def get_feedback_trend(self, days: int = 7) -> List[Dict[str, Any]]:
        trend = []
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days - 1)
        current_date = start_date
        while current_date <= end_date:
            total = self.db.query(func.count(FeedbackCase.id)).filter(
                func.date(FeedbackCase.created_at) == current_date
            ).scalar() or 0
            resolved = self.db.query(func.count(FeedbackCase.id)).filter(
                func.date(FeedbackCase.created_at) == current_date,
                FeedbackCase.status.in_(["confirmed_false_positive", "confirmed_risk", "closed", "resolved"]),
            ).scalar() or 0
            trend.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "count": total,
                "resolved_count": resolved,
            })
            current_date += timedelta(days=1)
        return trend

    def get_platform_overview(self) -> Dict[str, Any]:
        overview = self.get_overview()
        overview.update({
            "high_risk_count": self.db.query(func.count(ScanRecord.id)).filter(ScanRecord.label == "malicious").scalar() or 0,
            "plugin_event_count": self.db.query(func.count(PluginSyncEvent.id)).scalar() or 0,
            "warning_count": self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type == "warning").scalar() or 0,
            "bypass_count": self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type == "bypass").scalar() or 0,
            "trust_count": self.db.query(func.count(PluginSyncEvent.id)).filter(PluginSyncEvent.event_type.in_(["trust", "temporary_trust"])).scalar() or 0,
            "feedback_count": self.db.query(func.count(FeedbackCase.id)).scalar() or 0,
            "source_distribution": self.get_source_distribution(),
        })
        return overview
