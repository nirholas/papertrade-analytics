# Security

This project is read-only: it holds no keys, signs nothing and sends no transactions. It reads public Papertrade, Hyperliquid and HyperEVM data.

Report vulnerabilities privately through GitHub: https://github.com/nirholas/papertrade-analytics/security/advisories/new. Please do not open public issues for security reports. Expect an acknowledgement within a few days.

In scope: XSS or CSP bypass, cache poisoning in `/api/*`, SSRF through the proxy function (it only forwards to the configured Papertrade API). Out of scope: vulnerabilities in Papertrade itself, report those to Papertrade.
