from app.services.threat_intel_parser import parse_threat_intel_domains


def test_parse_hosts_format():
    text = """
0.0.0.0 example.com
127.0.0.1 bad.example.com
::1 malware.example.com
"""
    assert parse_threat_intel_domains(text) == {
        "example.com",
        "bad.example.com",
        "malware.example.com",
    }


def test_parse_plain_domains():
    text = """
example.com
bad.example.com
"""
    assert parse_threat_intel_domains(text) == {"example.com", "bad.example.com"}


def test_parse_urls():
    text = """
https://evil.example.com/path
http://phish.example.net/login
"""
    assert parse_threat_intel_domains(text) == {"evil.example.com", "phish.example.net"}


def test_parse_adguard_rules():
    text = """
||example.com^
||sub.example.com/path^
||bad.example.com^$script,third-party
"""
    assert parse_threat_intel_domains(text) == {
        "example.com",
        "sub.example.com",
        "bad.example.com",
    }


def test_skip_whitelist_comments_headers_and_regex():
    text = """
! comment
# another comment
[Adblock Plus 2.0]
@@||safe.example.com^
/bad[a-z]+domain/
||evil.example.com^
"""
    assert parse_threat_intel_domains(text) == {"evil.example.com"}


def test_skip_ip_localhost_invalid_and_wildcards():
    text = """
127.0.0.1
localhost
bad_domain
||*.wild.example.com^
0.0.0.0 192.168.1.1
valid.example.com
"""
    assert parse_threat_intel_domains(text) == {"valid.example.com"}


def test_normalize_www_protocol_port_and_path():
    text = """
https://www.Example.COM:8443/path?q=1
www.bad.example.net/login
"""
    assert parse_threat_intel_domains(text) == {"example.com", "bad.example.net"}
