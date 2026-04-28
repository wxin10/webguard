<#
.SYNOPSIS
Runs a local WebGuard HTTP smoke test.

.DESCRIPTION
This script validates the local/pre-production HTTP path without controlling
Chrome or Edge. It does not print access tokens, refresh tokens, or binding
codes. Use -DryRun to validate parameters and preview the checked endpoints.

.PARAMETER ApiBaseUrl
Backend API base URL. Defaults to WEBGUARD_SMOKE_API_BASE_URL or http://127.0.0.1:8000.

.PARAMETER WebBaseUrl
Web app base URL used for plugin binding verification URLs. Defaults to
WEBGUARD_SMOKE_WEB_BASE_URL or http://127.0.0.1:5173.

.PARAMETER Username
Formal Web login username. Defaults to WEBGUARD_SMOKE_USERNAME.

.PARAMETER Password
Formal Web login password. Defaults to WEBGUARD_SMOKE_PASSWORD.

.PARAMETER PluginInstanceId
Plugin instance id for the smoke run. Defaults to WEBGUARD_SMOKE_PLUGIN_INSTANCE_ID
or a timestamped local-smoke id.

.PARAMETER DryRun
Print the planned checks without sending HTTP requests.
#>
[CmdletBinding()]
param(
  [string]$ApiBaseUrl,
  [string]$WebBaseUrl,
  [string]$Username,
  [string]$Password,
  [string]$PluginInstanceId,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Setting {
  param(
    [string]$Value,
    [string]$EnvName,
    [string]$DefaultValue
  )
  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return $Value.Trim()
  }
  $envValue = [Environment]::GetEnvironmentVariable($EnvName)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) {
    return $envValue.Trim()
  }
  return $DefaultValue
}

function Describe-Secret {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return 'missing'
  }
  return "present(length=$($Value.Length))"
}

function Join-ApiUrl {
  param([string]$Path)
  $base = $script:ResolvedApiBaseUrl.TrimEnd('/')
  if ($Path.StartsWith('/')) {
    return "$base$Path"
  }
  return "$base/$Path"
}

function Convert-ResponseContent {
  param([string]$Content)
  if ([string]::IsNullOrWhiteSpace($Content)) {
    return $null
  }
  return $Content | ConvertFrom-Json
}

function Read-ErrorResponse {
  param($ErrorRecord)
  $response = $ErrorRecord.Exception.Response
  if ($null -eq $response) {
    throw $ErrorRecord
  }

  $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
  try {
    $content = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }

  $payload = Convert-ResponseContent $content
  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Payload = $payload
  }
}

function Invoke-Json {
  param(
    [ValidateSet('GET', 'POST', 'DELETE')]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = @{},
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
  )

  $params = @{
    Uri = Join-ApiUrl $Path
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
    ErrorAction = 'Stop'
  }

  if ($null -ne $Session) {
    $params.WebSession = $Session
  }

  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  try {
    $response = Invoke-WebRequest @params
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Payload = Convert-ResponseContent $response.Content
    }
  } catch {
    return Read-ErrorResponse $_
  }
}

function Assert-EnvelopeSuccess {
  param(
    [object]$Response,
    [string]$Label
  )
  if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 300) {
    throw "$Label failed with HTTP $($Response.StatusCode): $($Response.Payload.message)"
  }
  if ($null -eq $Response.Payload -or $Response.Payload.code -ne 0) {
    throw "$Label failed with business code $($Response.Payload.code): $($Response.Payload.message)"
  }
  return $Response.Payload.data
}

function Write-Step {
  param([string]$Message)
  Write-Host "[smoke] $Message"
}

$script:ResolvedApiBaseUrl = Resolve-Setting $ApiBaseUrl 'WEBGUARD_SMOKE_API_BASE_URL' 'http://127.0.0.1:8000'
$ResolvedWebBaseUrl = Resolve-Setting $WebBaseUrl 'WEBGUARD_SMOKE_WEB_BASE_URL' 'http://127.0.0.1:5173'
$ResolvedUsername = Resolve-Setting $Username 'WEBGUARD_SMOKE_USERNAME' ''
$ResolvedPassword = Resolve-Setting $Password 'WEBGUARD_SMOKE_PASSWORD' ''
$DefaultPluginId = "plugin_smoke_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$ResolvedPluginInstanceId = Resolve-Setting $PluginInstanceId 'WEBGUARD_SMOKE_PLUGIN_INSTANCE_ID' $DefaultPluginId
$PluginVersion = '1.0.0'

Write-Step "API base URL: $script:ResolvedApiBaseUrl"
Write-Step "Web base URL: $ResolvedWebBaseUrl"
Write-Step "Username: $ResolvedUsername"
Write-Step "Password: $(Describe-Secret $ResolvedPassword)"
Write-Step "Plugin instance id: $ResolvedPluginInstanceId"

if ($DryRun) {
  Write-Step 'Dry run only. Planned checks: /health, login, refresh, binding challenge, confirm, token exchange, bootstrap, safe scan, risky scan, instance list, revoke, revoked-token rejection.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ResolvedUsername) -or [string]::IsNullOrWhiteSpace($ResolvedPassword)) {
  throw 'Username and password are required. Pass -Username/-Password or set WEBGUARD_SMOKE_USERNAME/WEBGUARD_SMOKE_PASSWORD.'
}

$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Step 'Checking /health.'
$health = Invoke-Json -Method GET -Path '/health'
[void](Assert-EnvelopeSuccess $health 'health')

Write-Step 'Logging in with formal Web credentials.'
$login = Invoke-Json -Method POST -Path '/api/v1/auth/login' -Session $webSession -Body @{
  username = $ResolvedUsername
  password = $ResolvedPassword
}
$loginData = Assert-EnvelopeSuccess $login 'login'
$webAccessToken = [string]$loginData.access_token
if ([string]::IsNullOrWhiteSpace($webAccessToken)) {
  throw 'Login did not return an access token.'
}
Write-Step "Web access token: $(Describe-Secret $webAccessToken)"

Write-Step 'Refreshing Web session through HttpOnly cookie.'
$refresh = Invoke-Json -Method POST -Path '/api/v1/auth/refresh' -Session $webSession
$refreshData = Assert-EnvelopeSuccess $refresh 'refresh'
$webAccessToken = [string]$refreshData.access_token
Write-Step "Refreshed Web access token: $(Describe-Secret $webAccessToken)"

$webHeaders = @{
  Authorization = "Bearer $webAccessToken"
}
$pluginHeaders = @{
  'X-Plugin-Instance-Id' = $ResolvedPluginInstanceId
  'X-Plugin-Version' = $PluginVersion
}

Write-Step 'Creating plugin binding challenge.'
$challenge = Invoke-Json -Method POST -Path '/api/v1/plugin/binding-challenges' -Headers $pluginHeaders -Body @{
  web_base_url = $ResolvedWebBaseUrl
}
$challengeData = Assert-EnvelopeSuccess $challenge 'binding challenge'
$challengeId = [string]$challengeData.challenge_id
$bindingCode = [string]$challengeData.binding_code
if ([string]::IsNullOrWhiteSpace($challengeId) -or [string]::IsNullOrWhiteSpace($bindingCode)) {
  throw 'Binding challenge response did not include challenge id and code.'
}
Write-Step 'Binding challenge created. Binding code is present but not printed.'

Write-Step 'Confirming binding challenge with Web token.'
$confirm = Invoke-Json -Method POST -Path "/api/v1/plugin/binding-challenges/$challengeId/confirm" -Headers $webHeaders -Body @{
  binding_code = $bindingCode
  display_name = 'Local Smoke Browser'
}
[void](Assert-EnvelopeSuccess $confirm 'binding confirm')

Write-Step 'Exchanging confirmed challenge for plugin tokens.'
$token = Invoke-Json -Method POST -Path '/api/v1/plugin/token' -Headers $pluginHeaders -Body @{
  challenge_id = $challengeId
  binding_code = $bindingCode
}
$tokenData = Assert-EnvelopeSuccess $token 'plugin token exchange'
$pluginAccessToken = [string]$tokenData.access_token
$pluginRefreshToken = [string]$tokenData.refresh_token
if ([string]::IsNullOrWhiteSpace($pluginAccessToken) -or [string]::IsNullOrWhiteSpace($pluginRefreshToken)) {
  throw 'Plugin token exchange did not return access and refresh tokens.'
}
Write-Step "Plugin access token: $(Describe-Secret $pluginAccessToken)"
Write-Step "Plugin refresh token: $(Describe-Secret $pluginRefreshToken)"

$pluginAuthHeaders = @{
  Authorization = "Bearer $pluginAccessToken"
  'X-Plugin-Instance-Id' = $ResolvedPluginInstanceId
  'X-Plugin-Version' = $PluginVersion
}

Write-Step 'Checking plugin bootstrap with plugin token.'
$bootstrap = Invoke-Json -Method GET -Path '/api/v1/plugin/bootstrap' -Headers $pluginAuthHeaders
[void](Assert-EnvelopeSuccess $bootstrap 'plugin bootstrap')

Write-Step 'Checking safe URL scan.'
$safeScan = Invoke-Json -Method POST -Path '/api/v1/plugin/analyze-current' -Headers $pluginAuthHeaders -Body @{
  url = 'https://example.com'
  title = 'Example Domain'
  visible_text = 'Example Domain'
  button_texts = @()
  input_labels = @()
  form_action_domains = @()
  has_password_input = $false
}
$safeData = Assert-EnvelopeSuccess $safeScan 'safe scan'
if ($safeData.action -ne 'ALLOW') {
  throw "Safe scan expected ALLOW, got $($safeData.action)."
}

Write-Step 'Checking risky URL scan.'
$riskyScan = Invoke-Json -Method POST -Path '/api/v1/plugin/analyze-current' -Headers $pluginAuthHeaders -Body @{
  url = 'https://login-paypal-account-security.example-phish.com/verify/password'
  title = 'PayPal Secure Login'
  visible_text = 'Verify your account password to continue payment.'
  button_texts = @('Sign in', 'Verify')
  input_labels = @('Email', 'Password')
  form_action_domains = @('secure-paypal.example-phish.com')
  has_password_input = $true
}
$riskyData = Assert-EnvelopeSuccess $riskyScan 'risky scan'
if ($riskyData.action -ne 'BLOCK' -and $riskyData.action -ne 'WARN') {
  throw "Risky scan expected BLOCK or WARN, got $($riskyData.action)."
}

Write-Step 'Checking plugin instance list.'
$instances = Invoke-Json -Method GET -Path '/api/v1/plugin/instances' -Headers $webHeaders
$instancesData = Assert-EnvelopeSuccess $instances 'plugin instances'
$matchingInstances = @($instancesData.items) | Where-Object { $_.plugin_instance_id -eq $ResolvedPluginInstanceId }
if ($matchingInstances.Count -lt 1) {
  throw 'Plugin instance list did not include the smoke plugin instance.'
}

Write-Step 'Revoking plugin instance.'
$revoke = Invoke-Json -Method DELETE -Path "/api/v1/plugin/instances/$ResolvedPluginInstanceId" -Headers $webHeaders
$revokeData = Assert-EnvelopeSuccess $revoke 'plugin revoke'
if ($revokeData.status -ne 'revoked') {
  throw "Revoke expected status revoked, got $($revokeData.status)."
}

Write-Step 'Checking revoked plugin token is rejected.'
$revokedBootstrap = Invoke-Json -Method GET -Path '/api/v1/plugin/bootstrap' -Headers $pluginAuthHeaders
if ($revokedBootstrap.StatusCode -ne 403) {
  throw "Revoked plugin token expected HTTP 403, got HTTP $($revokedBootstrap.StatusCode)."
}

Write-Step 'Smoke test completed successfully.'
