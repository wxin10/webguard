from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..core import settings
from ..models import ModelVersion

try:
    import paddle
    import paddle.nn.functional as F
    from paddlenlp.transformers import AutoTokenizer, ErnieForSequenceClassification
except Exception:
    paddle = None
    F = None
    AutoTokenizer = None
    ErnieForSequenceClassification = None


class ModelService:
    """Model service with a safe mock fallback for demo environments."""

    def __init__(self, db: Session, model_dir: Optional[str] = None):
        self.db = db
        self.backend_root = Path(__file__).resolve().parents[2]
        self.model_root = model_dir or settings.MODEL_DIR or "./models"
        self.active_model = self.get_active_model()
        self.loaded_model_dir: Optional[Path] = None
        self.model, self.model_type = self.load_model()

    def get_active_model(self) -> Optional[ModelVersion]:
        return self.db.query(ModelVersion).filter(ModelVersion.is_active == True).first()

    def load_model(self) -> Tuple[Any, str]:
        if not self._real_model_dependencies_available():
            return MockModel(), "mock"

        for candidate in self._collect_candidate_model_dirs():
            if not self._is_valid_paddle_model_dir(candidate):
                continue
            try:
                real_model = RealModel(candidate)
                self.loaded_model_dir = candidate
                return real_model, "real"
            except Exception as exc:
                print(f"Failed to load real model from {candidate}: {exc}")

        return MockModel(), "mock"

    def _real_model_dependencies_available(self) -> bool:
        return all([paddle, F, AutoTokenizer, ErnieForSequenceClassification])

    def _collect_candidate_model_dirs(self) -> List[Path]:
        candidates: List[Path] = []
        seen = set()

        def add_candidate(path_value: Optional[str | Path]) -> None:
            if not path_value:
                return
            resolved = self._resolve_path(path_value)
            key = str(resolved)
            if key not in seen:
                seen.add(key)
                candidates.append(resolved)

        if self.active_model and getattr(self.active_model, "path", None):
            add_candidate(self.active_model.path)

        model_root_path = self._resolve_path(self.model_root)
        add_candidate(model_root_path)

        if model_root_path.exists() and model_root_path.is_dir():
            for child in sorted(model_root_path.iterdir()):
                if child.is_dir():
                    add_candidate(child)

        return candidates

    def _resolve_path(self, path_value: str | Path) -> Path:
        path_obj = Path(path_value)
        if path_obj.is_absolute():
            return path_obj.resolve()
        cwd_based = (Path.cwd() / path_obj).resolve()
        if cwd_based.exists():
            return cwd_based
        return (self.backend_root / path_obj).resolve()

    def _is_valid_paddle_model_dir(self, model_dir: Path) -> bool:
        return model_dir.exists() and model_dir.is_dir() and (model_dir / "config.json").exists() and (model_dir / "model_state.pdparams").exists()

    def predict(self, model_input: str) -> Dict[str, float]:
        return self.model.predict(model_input)

    def get_model_status(self) -> Dict[str, Any]:
        return {
            "active_model": self.active_model,
            "model_count": self.db.query(ModelVersion).count(),
            "model_type": self.model_type,
            "loaded_model_dir": str(self.loaded_model_dir) if self.loaded_model_dir else None,
        }

    def get_model_versions(self) -> List[ModelVersion]:
        return self.db.query(ModelVersion).all()

    def get_model_metadata(self) -> Dict[str, Any]:
        metadata = {
            "model_type": self.model_type,
            "loaded_model_dir": str(self.loaded_model_dir) if self.loaded_model_dir else None,
        }
        if hasattr(self.model, "get_metadata"):
            metadata.update(self.model.get_metadata())
        return metadata


class RealModel:
    def __init__(self, model_dir: Path, max_seq_len: int = 256):
        if not all([paddle, F, AutoTokenizer, ErnieForSequenceClassification]):
            raise RuntimeError("Paddle dependencies are unavailable")
        self.model_dir = model_dir
        self.max_seq_len = max_seq_len
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.model = ErnieForSequenceClassification.from_pretrained(str(model_dir))
        self.model.eval()
        self.label_names = self._load_label_names()

    def _load_label_names(self) -> List[str]:
        default_labels = ["safe", "suspicious", "malicious"]
        label_map_path = self.model_dir / "label_map.json"
        if not label_map_path.exists():
            return default_labels
        try:
            with open(label_map_path, "r", encoding="utf-8") as file:
                label_map = json.load(file)
            if isinstance(label_map, dict):
                if all(isinstance(value, int) for value in label_map.values()):
                    return [item[0] for item in sorted(label_map.items(), key=lambda item: item[1])]
                if all(str(key).isdigit() for key in label_map.keys()):
                    return [item[1] for item in sorted(label_map.items(), key=lambda item: int(item[0]))]
        except Exception as exc:
            print(f"Failed to read label_map.json: {exc}")
        return default_labels

    def _normalize_probs(self, probs: List[float]) -> List[float]:
        if len(probs) < 3:
            probs = probs + [0.0] * (3 - len(probs))
        elif len(probs) > 3:
            probs = probs[:3]
        total = sum(probs)
        if total <= 0:
            return [1 / 3, 1 / 3, 1 / 3]
        return [float(value / total) for value in probs]

    def predict(self, input_text: str) -> Dict[str, float]:
        text = (input_text or "").strip() or " "
        encoded = self.tokenizer(text=text, max_seq_len=self.max_seq_len, pad_to_max_seq_len=True, truncation=True)
        input_ids = paddle.to_tensor([encoded["input_ids"]], dtype="int64")
        token_type_ids = encoded.get("token_type_ids") or [0] * len(encoded["input_ids"])
        token_type_ids = paddle.to_tensor([token_type_ids], dtype="int64")

        with paddle.no_grad():
            outputs = self.model(input_ids=input_ids, token_type_ids=token_type_ids)
            logits = outputs[0] if isinstance(outputs, tuple) else getattr(outputs, "logits", outputs)
            probs = F.softmax(logits, axis=-1).numpy()[0].tolist()

        safe_prob, suspicious_prob, malicious_prob = self._normalize_probs(probs)
        predicted_label = max(
            {"safe": safe_prob, "suspicious": suspicious_prob, "malicious": malicious_prob}.items(),
            key=lambda item: item[1],
        )[0]
        return {
            "safe_prob": safe_prob,
            "suspicious_prob": suspicious_prob,
            "malicious_prob": malicious_prob,
            "predicted_label": predicted_label,
        }

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "framework": "PaddleNLP",
            "model_dir": str(self.model_dir),
            "max_seq_len": self.max_seq_len,
            "labels": self.label_names,
        }


class MockModel:
    def __init__(self):
        self.malicious_keywords = [
            "phish", "login", "password", "account", "verify", "signin", "payment", "wallet", "bank",
            "钓鱼", "密码", "账户", "验证", "登录", "支付", "银行",
        ]
        self.safe_keywords = ["official", "secure", "trust", "privacy", "官方", "安全", "可信", "隐私"]

    def predict(self, input_text: str) -> Dict[str, float]:
        text = (input_text or "").lower()
        malicious_hits = sum(1 for keyword in self.malicious_keywords if keyword.lower() in text)
        safe_hits = sum(1 for keyword in self.safe_keywords if keyword.lower() in text)

        safe_prob = 0.55 + safe_hits * 0.12 - malicious_hits * 0.12
        malicious_prob = 0.18 + malicious_hits * 0.14 - safe_hits * 0.08
        safe_prob = max(0.05, min(0.9, safe_prob))
        malicious_prob = max(0.05, min(0.9, malicious_prob))
        suspicious_prob = max(0.05, 1.0 - safe_prob - malicious_prob)

        total = safe_prob + suspicious_prob + malicious_prob
        safe_prob /= total
        suspicious_prob /= total
        malicious_prob /= total

        predicted_label = max(
            {"safe": safe_prob, "suspicious": suspicious_prob, "malicious": malicious_prob}.items(),
            key=lambda item: item[1],
        )[0]
        return {
            "safe_prob": float(safe_prob),
            "suspicious_prob": float(suspicious_prob),
            "malicious_prob": float(malicious_prob),
            "predicted_label": predicted_label,
        }

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "framework": "mock",
            "labels": ["safe", "suspicious", "malicious"],
            "note": "真实 Paddle 模型不可用时使用，保证演示链路可运行。",
        }
