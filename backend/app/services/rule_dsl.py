from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


ALLOWED_FIELDS = {
    "url",
    "domain",
    "title",
    "visible_text",
    "button_texts",
    "input_labels",
    "form_action_domains",
    "has_password_input",
    "url_length",
    "all_text",
}

ALLOWED_OPERATORS = {
    "equals",
    "contains",
    "contains_any",
    "regex",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "domain_matches",
    "count_ge",
}

MAX_REGEX_PATTERN_LENGTH = 200
MAX_REGEX_TEXT_LENGTH = 5000


@dataclass(frozen=True)
class RuleDslEvaluation:
    matched: bool
    reason: str
    raw_feature: dict[str, Any]
    observed_value: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "matched": self.matched,
            "reason": self.reason,
            "raw_feature": self.raw_feature,
            "observed_value": self.observed_value,
        }


class RuleDslEvaluator:
    """Evaluates a small, data-only rule DSL without executing user input."""

    def __init__(self, context: dict[str, Any]):
        self.context = self._normalize_context(context)

    def evaluate(self, condition: Any) -> dict[str, Any]:
        result = self._evaluate_node(condition)
        return result.as_dict()

    def _evaluate_node(self, node: Any) -> RuleDslEvaluation:
        if not isinstance(node, dict):
            return self._invalid("condition must be an object", node)

        if "all" in node:
            return self._evaluate_all(node)
        if "any" in node:
            return self._evaluate_any(node)
        if "not" in node:
            return self._evaluate_not(node)
        if "field" in node or "operator" in node:
            return self._evaluate_condition(node)
        return self._invalid("condition must contain field/operator, all, any, or not", node)

    def _evaluate_all(self, node: dict[str, Any]) -> RuleDslEvaluation:
        children = node.get("all")
        if not isinstance(children, list) or not children:
            return self._invalid("all must be a non-empty list", node)

        child_results = [self._evaluate_node(child) for child in children]
        matched = all(item.matched for item in child_results)
        failed = next((item for item in child_results if not item.matched), None)
        reason = "all conditions matched" if matched else f"all condition failed: {failed.reason if failed else 'unknown'}"
        return RuleDslEvaluation(
            matched=matched,
            reason=reason,
            raw_feature={
                "operator": "all",
                "children": [item.raw_feature for item in child_results],
            },
            observed_value=1.0 if matched else 0.0,
        )

    def _evaluate_any(self, node: dict[str, Any]) -> RuleDslEvaluation:
        children = node.get("any")
        if not isinstance(children, list) or not children:
            return self._invalid("any must be a non-empty list", node)

        child_results = [self._evaluate_node(child) for child in children]
        matched = any(item.matched for item in child_results)
        hit = next((item for item in child_results if item.matched), None)
        reason = f"any condition matched: {hit.reason}" if hit else "no any condition matched"
        return RuleDslEvaluation(
            matched=matched,
            reason=reason,
            raw_feature={
                "operator": "any",
                "children": [item.raw_feature for item in child_results],
            },
            observed_value=1.0 if matched else 0.0,
        )

    def _evaluate_not(self, node: dict[str, Any]) -> RuleDslEvaluation:
        child = self._evaluate_node(node.get("not"))
        if child.reason.startswith("Invalid rule DSL:"):
            return self._invalid(f"not child invalid: {child.reason}", node)
        matched = not child.matched
        return RuleDslEvaluation(
            matched=matched,
            reason=f"not condition {'matched' if matched else 'failed'}: {child.reason}",
            raw_feature={
                "operator": "not",
                "child": child.raw_feature,
            },
            observed_value=1.0 if matched else 0.0,
        )

    def _evaluate_condition(self, node: dict[str, Any]) -> RuleDslEvaluation:
        field = node.get("field")
        operator = node.get("operator")
        expected = node.get("value")
        if field not in ALLOWED_FIELDS:
            return self._invalid(f"unsupported field: {field}", node)
        if operator not in ALLOWED_OPERATORS:
            return self._invalid(f"unsupported operator: {operator}", node)

        actual = self.context.get(str(field))
        raw_feature = {
            "field": field,
            "operator": operator,
            "value": expected,
            "actual": actual,
        }

        try:
            if operator == "equals":
                matched = actual == expected
                return self._condition_result(matched, f"{field} equals {expected}", raw_feature)
            if operator == "contains":
                matched, count = self._contains(actual, expected)
                return self._condition_result(matched, f"{field} contains {expected}", raw_feature, count)
            if operator == "contains_any":
                matched, count = self._contains_any(actual, expected)
                return self._condition_result(matched, f"{field} contains any {expected}", raw_feature, count)
            if operator == "regex":
                return self._regex(field, actual, expected, raw_feature)
            if operator in {"gt", "gte", "lt", "lte"}:
                return self._compare(field, operator, actual, expected, raw_feature)
            if operator == "in":
                matched = self._in(actual, expected)
                return self._condition_result(matched, f"{field} in {expected}", raw_feature)
            if operator == "domain_matches":
                matched = self._domain_matches(actual, expected)
                return self._condition_result(matched, f"{field} domain_matches {expected}", raw_feature)
            if operator == "count_ge":
                matched, count, minimum = self._count_ge(actual, expected)
                raw_feature["minimum"] = minimum
                return self._condition_result(matched, f"{field} count {count} >= {minimum}", raw_feature, count)
        except Exception as exc:
            return self._invalid(f"condition evaluation failed: {exc}", raw_feature)

        return self._invalid(f"unsupported operator: {operator}", node)

    def _regex(self, field: str, actual: Any, expected: Any, raw_feature: dict[str, Any]) -> RuleDslEvaluation:
        if not isinstance(expected, str) or not expected:
            return self._invalid("regex value must be a non-empty string", raw_feature)
        if len(expected) > MAX_REGEX_PATTERN_LENGTH:
            return self._invalid(f"regex pattern is longer than {MAX_REGEX_PATTERN_LENGTH}", raw_feature)

        text = self._text_for_match(actual)[:MAX_REGEX_TEXT_LENGTH]
        try:
            matched = re.search(expected, text, flags=re.IGNORECASE) is not None
        except re.error as exc:
            return self._invalid(f"invalid regex: {exc}", raw_feature)
        return self._condition_result(matched, f"{field} regex {expected}", raw_feature)

    def _compare(
        self,
        field: str,
        operator: str,
        actual: Any,
        expected: Any,
        raw_feature: dict[str, Any],
    ) -> RuleDslEvaluation:
        actual_number = self._to_number(actual)
        expected_number = self._to_number(expected)
        if actual_number is None or expected_number is None:
            return self._invalid(f"{operator} requires numeric actual and value", raw_feature)

        matched = {
            "gt": actual_number > expected_number,
            "gte": actual_number >= expected_number,
            "lt": actual_number < expected_number,
            "lte": actual_number <= expected_number,
        }[operator]
        return self._condition_result(
            matched,
            f"{field} {operator} {expected_number:g}",
            raw_feature,
            actual_number,
        )

    def _contains(self, actual: Any, expected: Any) -> tuple[bool, float]:
        if not isinstance(expected, str):
            return False, 0.0
        needle = expected.casefold()
        if isinstance(actual, list):
            count = sum(1 for item in actual if needle in str(item).casefold())
            return count > 0, float(count)
        matched = needle in str(actual or "").casefold()
        return matched, 1.0 if matched else 0.0

    def _contains_any(self, actual: Any, expected: Any) -> tuple[bool, float]:
        terms = self._string_terms(expected)
        if not terms:
            return False, 0.0
        if isinstance(actual, list):
            count = 0
            for item in actual:
                text = str(item).casefold()
                if any(term in text for term in terms):
                    count += 1
            return count > 0, float(count)
        text = str(actual or "").casefold()
        count = sum(1 for term in terms if term in text)
        return count > 0, float(count)

    def _count_ge(self, actual: Any, expected: Any) -> tuple[bool, float, float]:
        terms: list[str] = []
        minimum: float | None = None

        if isinstance(expected, dict):
            terms = self._string_terms(
                expected.get("terms")
                if "terms" in expected
                else expected.get("contains_any")
                if "contains_any" in expected
                else expected.get("value")
            )
            minimum = self._to_number(
                expected.get("count")
                if "count" in expected
                else expected.get("threshold")
                if "threshold" in expected
                else expected.get("min")
            )
        elif isinstance(expected, (int, float)):
            minimum = float(expected)
        else:
            terms = self._string_terms(expected)

        if minimum is None:
            minimum = 1.0

        if terms:
            if isinstance(actual, list):
                count = sum(1 for item in actual if any(term in str(item).casefold() for term in terms))
            else:
                text = str(actual or "").casefold()
                count = sum(1 for term in terms if term in text)
        elif isinstance(actual, list):
            count = len([item for item in actual if str(item).strip()])
        else:
            numeric_actual = self._to_number(actual)
            count = numeric_actual if numeric_actual is not None else 0.0

        count_float = float(count)
        return count_float >= minimum, count_float, float(minimum)

    def _in(self, actual: Any, expected: Any) -> bool:
        if isinstance(expected, list):
            if isinstance(actual, list):
                expected_text = {str(item).casefold() for item in expected}
                return any(str(item).casefold() in expected_text for item in actual)
            return str(actual).casefold() in {str(item).casefold() for item in expected}
        return False

    def _domain_matches(self, actual: Any, expected: Any) -> bool:
        if not isinstance(expected, str):
            return False
        domain = self._normalize_domain(str(actual or ""))
        pattern = self._normalize_domain(expected)
        if not domain or not pattern:
            return False
        return domain == pattern or domain.endswith(f".{pattern}")

    def _condition_result(
        self,
        matched: bool,
        reason: str,
        raw_feature: dict[str, Any],
        observed_value: float | bool | int = 1.0,
    ) -> RuleDslEvaluation:
        return RuleDslEvaluation(
            matched=matched,
            reason=reason if matched else f"{reason} not matched",
            raw_feature=raw_feature,
            observed_value=float(observed_value if matched else 0.0),
        )

    def _invalid(self, reason: str, raw_feature: Any) -> RuleDslEvaluation:
        return RuleDslEvaluation(
            matched=False,
            reason=f"Invalid rule DSL: {reason}",
            raw_feature=raw_feature if isinstance(raw_feature, dict) else {"condition": raw_feature},
            observed_value=0.0,
        )

    def _normalize_context(self, context: dict[str, Any]) -> dict[str, Any]:
        normalized = {field: context.get(field) for field in ALLOWED_FIELDS}
        normalized["url"] = str(normalized.get("url") or "")
        normalized["domain"] = str(normalized.get("domain") or "")
        normalized["title"] = str(normalized.get("title") or "")
        normalized["visible_text"] = str(normalized.get("visible_text") or "")
        normalized["button_texts"] = self._list_of_strings(normalized.get("button_texts"))
        normalized["input_labels"] = self._list_of_strings(normalized.get("input_labels"))
        normalized["form_action_domains"] = self._list_of_strings(normalized.get("form_action_domains"))
        normalized["has_password_input"] = bool(normalized.get("has_password_input"))
        normalized["all_text"] = str(normalized.get("all_text") or "")
        normalized["url_length"] = len(normalized["url"])
        return normalized

    def _text_for_match(self, value: Any) -> str:
        if isinstance(value, list):
            return " ".join(str(item) for item in value)
        return str(value or "")

    def _string_terms(self, value: Any) -> list[str]:
        if isinstance(value, str):
            return [value.casefold()]
        if isinstance(value, list):
            return [str(item).casefold() for item in value if str(item)]
        return []

    def _list_of_strings(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value if str(item).strip()]

    def _to_number(self, value: Any) -> float | None:
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None
        return None

    def _normalize_domain(self, value: str) -> str:
        return value.strip().casefold().lstrip(".").removeprefix("www.")
