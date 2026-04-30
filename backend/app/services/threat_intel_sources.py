from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ThreatIntelSource:
    source_key: str
    name: str
    url: str
    risk_type: str
    description: str
    enabled: bool = True


DEFAULT_THREAT_INTEL_SOURCES: tuple[ThreatIntelSource, ...] = (
    ThreatIntelSource(
        source_key="malwaredomainlist",
        name="MalwareDomainList",
        url="https://www.malwaredomainlist.com/hostslist/hosts.txt",
        risk_type="malware",
        description="Malware, trojan, and drive-by-download related domains.",
    ),
    ThreatIntelSource(
        source_key="scamblocklist",
        name="Scam Blocklist by DurableNapkin",
        url="https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/adguard.txt",
        risk_type="scam",
        description="Scam, phishing, and fraud website rules.",
    ),
    ThreatIntelSource(
        source_key="spam404",
        name="Spam404",
        url="https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt",
        risk_type="spam_scam",
        description="Spam, scam, and malicious page blacklist.",
    ),
    ThreatIntelSource(
        source_key="hacked_malware_sites",
        name="The Big List of Hacked Malware Web Sites",
        url="https://raw.githubusercontent.com/mitchellkrogza/The-Big-List-of-Hacked-Malware-Web-Sites/master/hosts",
        risk_type="hacked_malware",
        description="Compromised, injected, and malware-serving websites.",
    ),
    ThreatIntelSource(
        source_key="urlhaus_online",
        name="URLHaus / Online Malicious URL Blocklist",
        url="https://curben.gitlab.io/malware-filter/urlhaus-filter-agh-online.txt",
        risk_type="malicious_url",
        description="Online malicious URL and malicious domain rules.",
    ),
    ThreatIntelSource(
        source_key="nocoin",
        name="NoCoin Filter List",
        url="https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt",
        risk_type="cryptomining",
        description="Cryptocurrency mining and web-mining script domains.",
    ),
    ThreatIntelSource(
        source_key="adguard_dns",
        name="AdGuard DNS filter",
        url="https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
        risk_type="mixed_malicious_dns",
        description="AdGuard DNS security-oriented rules including malicious domains, phishing, and related DNS risks.",
    ),
)
