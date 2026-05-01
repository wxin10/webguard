import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


class FeatureExtractor:
    """Extract normalized URL and page features for rules and semantic analysis."""

    @staticmethod
    def extract_domain(url: str) -> str:
        parsed_url = urlparse(url)
        domain = parsed_url.netloc
        if ":" in domain:
            domain = domain.split(":", 1)[0]
        return domain

    @staticmethod
    def normalize_url(url: str) -> str:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        return url

    @staticmethod
    def clean_text(text: str) -> str:
        text = re.sub(r"\s+", " ", text)
        text = re.sub(r"<[^>]+>", "", text)
        return text.strip()

    @staticmethod
    def normalize_list(items: List[str]) -> List[str]:
        return [item.strip() for item in items if isinstance(item, str) and item.strip()]

    @staticmethod
    def construct_semantic_input(
        url: str,
        domain: str,
        title: str,
        visible_text: str,
        button_texts: List[str],
        input_labels: List[str],
        form_action_domains: List[str],
        has_password_input: bool,
    ) -> str:
        template = f"""
[URL] {url}
[DOMAIN] {domain}
[TITLE] {title}
[TEXT] {visible_text}
[BUTTONS] {", ".join(button_texts)}
[INPUTS] {", ".join(input_labels)}
[FORM_ACTIONS] {", ".join(form_action_domains)}
[PASSWORD] {"yes" if has_password_input else "no"}
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
        has_password_input: Optional[bool] = None,
    ) -> Dict[str, Any]:
        url = FeatureExtractor.normalize_url(url)
        domain = FeatureExtractor.extract_domain(url)

        normalized_title = FeatureExtractor.clean_text(title) if title else ""
        normalized_visible_text = FeatureExtractor.clean_text(visible_text) if visible_text else ""
        normalized_button_texts = FeatureExtractor.normalize_list(button_texts or [])
        normalized_input_labels = FeatureExtractor.normalize_list(input_labels or [])
        normalized_form_action_domains = FeatureExtractor.normalize_list(form_action_domains or [])
        normalized_has_password_input = bool(has_password_input)

        semantic_input = FeatureExtractor.construct_semantic_input(
            url,
            domain,
            normalized_title,
            normalized_visible_text,
            normalized_button_texts,
            normalized_input_labels,
            normalized_form_action_domains,
            normalized_has_password_input,
        )

        raw_features = {
            "url": url,
            "domain": domain,
            "title": normalized_title,
            "visible_text": normalized_visible_text,
            "button_texts": normalized_button_texts,
            "input_labels": normalized_input_labels,
            "form_action_domains": normalized_form_action_domains,
            "has_password_input": normalized_has_password_input,
        }

        return {
            "domain": domain,
            "semantic_input": semantic_input,
            "raw_features": raw_features,
            "has_password_input": normalized_has_password_input,
        }
