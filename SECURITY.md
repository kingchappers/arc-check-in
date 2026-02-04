# Security Best Practices

This document outlines security requirements for code changes in this repository. All contributions must adhere to these guidelines, which are based on [OWASP Top 10:2025](https://owasp.org/Top10/2025/), [OWASP Serverless Top 10](https://owasp.org/www-project-serverless-top-10/), [CIS AWS Foundations Benchmark](https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html), and [AWS Security Best Practices](https://docs.aws.amazon.com/apigateway/latest/developerguide/security-best-practices.html).

## A01: Broken Access Control

**In this application:**
- JWT validation in `api-handler.ts` is the primary access control mechanism
- All protected API endpoints must verify JWT signature, audience, and expiration

**Requirements:**
- Never bypass JWT validation for protected endpoints
- Validate the `aud` (audience) claim matches `AUTH0_AUDIENCE`
- Validate the `iss` (issuer) claim matches the Auth0 domain
- Check token expiration before processing requests
- Return 401/403 with minimal error details (don't leak validation logic)

## A02: Security Misconfiguration

**In this application:**
- OpenTofu infrastructure in `infra/` defines AWS resource configurations
- Lambda function permissions and API Gateway settings are security-critical

**Requirements:**
- Lambda IAM roles must follow least privilege (no `*` wildcard permissions)
- Each Lambda function must have its own dedicated IAM role
- Never enable API Gateway endpoints without authentication unless intentionally public
- Keep `NODE_ENV=production` in Lambda environment for production deployments
- Review all Terraform/OpenTofu changes for security implications

## A03: Software Supply Chain Failures

**In this application:**
- npm dependencies for frontend and API handler
- Lambda layers and node_modules bundled in `build/api/`

**Requirements:**
- Run `npm audit` or `yarn audit` before adding new dependencies
- Pin dependency versions in `package.json` (avoid `^` or `*` for production deps)
- Review dependency changelogs when upgrading versions
- Minimize dependencies in Lambda functions (smaller attack surface)
- Never commit `node_modules/` to the repository

## A04: Cryptographic Failures

**In this application:**
- JWT tokens contain user identity claims
- Auth0 handles cryptographic operations for authentication

**Requirements:**
- Never log JWT tokens or their contents
- Never store tokens in localStorage (use Auth0 SDK's in-memory storage)
- Always use HTTPS for API calls (enforced by API Gateway)
- Never implement custom JWT signing or verification logic (use `jsonwebtoken` library)
- Never expose Auth0 client secrets in frontend code

## A05: Injection

**In this application:**
- API Gateway receives untrusted input from HTTP requests
- Lambda functions process event data from multiple sources

**Requirements:**
- Validate and sanitize all input in Lambda handlers before processing
- Use parameterized queries if adding database access (never string concatenation)
- Escape output when rendering user-provided content in React components
- Validate expected data types, formats, and lengths for all request parameters
- Never pass user input directly to `eval()`, `Function()`, or shell commands

**Lambda-specific injection vectors to protect:**
- HTTP request body, headers, and query parameters
- Path parameters from API Gateway
- Any future event sources (S3, DynamoDB streams, etc.)

## A06: Insecure Design

**Requirements:**
- Implement rate limiting for API endpoints to prevent abuse
- Design with defense in depth (don't rely solely on JWT validation)
- Fail closed: deny access by default, explicitly grant permissions
- Consider the blast radius of security failures when designing new features

## A07: Authentication Failures

**In this application:**
- Auth0 handles user authentication
- `useProtectedApi` hook manages token acquisition for API calls

**Requirements:**
- Never implement custom authentication logic (use Auth0 SDK)
- Never store credentials or tokens outside Auth0's recommended patterns
- Ensure `getAccessTokenSilently()` is called for each API request (tokens refresh automatically)
- Handle authentication errors gracefully without exposing internal details
- Log authentication failures for security monitoring

## A08: Software or Data Integrity Failures

**In this application:**
- CI/CD pipeline in `.github/workflows/` automates deployments
- Build scripts modify and bundle code

**Requirements:**
- Never disable pre-commit hooks or CI checks (`--no-verify` is prohibited)
- Verify integrity of build outputs before deployment
- Use OIDC for AWS authentication in CI/CD (no long-lived credentials)
- Review all changes to build scripts and workflow files carefully

## A09: Security Logging and Alerting Failures

**In this application:**
- CloudWatch captures Lambda logs
- API Gateway access logs can be enabled

**Requirements:**
- Log security-relevant events (authentication failures, access denials, input validation failures)
- Never log sensitive data (tokens, passwords, PII, full request bodies)
- Mask or redact sensitive fields before logging
- Include correlation IDs for tracing requests across services
- Ensure log retention policies comply with requirements

## A10: Mishandling of Exceptional Conditions

**In this application:**
- Lambda functions must handle errors from Auth0, network failures, and malformed requests

**Requirements:**
- Catch and handle all exceptions in Lambda handlers
- Return appropriate HTTP status codes (400 for bad input, 401/403 for auth, 500 for server errors)
- Never expose stack traces or internal error details in API responses
- Log full error details server-side for debugging
- Implement circuit breakers for external service calls if adding dependencies

---

## Serverless-Specific Security (AWS Lambda)

Based on [OWASP Serverless Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Serverless_FaaS_Security_Cheat_Sheet.html):

### IAM Least Privilege
```hcl
# Good: Specific permissions
policy = jsonencode({
  Statement = [{
    Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    Resource = "arn:aws:logs:*:*:log-group:/aws/lambda/specific-function:*"
  }]
})

# Bad: Wildcard permissions
policy = jsonencode({
  Statement = [{
    Action   = ["*"]
    Resource = "*"
  }]
})
```

### Execution Context Security
- Never store sensitive data in global variables (persists between invocations)
- Clear temporary files after use
- Assume the execution environment is shared

### Secrets Management
- Use AWS Secrets Manager or Parameter Store for secrets
- Never hardcode credentials in Lambda code or environment variables
- Rotate credentials regularly

### Cold Start Considerations
- Don't leak data through global state initialized at cold start
- Validate environment variables at startup

---

## React Frontend Security

### XSS Prevention
- React escapes content by default, but be cautious with:
  - `dangerouslySetInnerHTML` (avoid unless absolutely necessary)
  - URL parameters rendered in the UI
  - Third-party component libraries
- Sanitize any user content before display

### Token Storage
- Auth0 SDK stores tokens in memory (not localStorage)
- This is intentional - localStorage is vulnerable to XSS
- Accept the trade-off: users re-authenticate on page refresh

### Dependencies
- Audit third-party packages before adding
- Minimize client-side dependencies (each is an XSS vector)
- Keep dependencies updated

---

## Infrastructure Security (OpenTofu/Terraform)

### State File Protection
- Terraform state contains sensitive data
- S3 backend must have versioning and encryption enabled
- Never commit `.tfstate` files to the repository

### Resource Configuration
- Enable CloudWatch logging for all Lambda functions
- Configure API Gateway access logs
- Use VPC endpoints for AWS service calls if handling sensitive data
- Enable AWS X-Ray for distributed tracing in production

### CI/CD Pipeline Security
- Use OIDC role assumption (no static AWS credentials)
- Scope CI/CD IAM role to minimum required permissions
- Review `terraform plan` output before applying
- Never use `terraform apply -auto-approve` for production changes outside CI/CD

---

## Security Review Checklist

Before merging code changes, verify:

- [ ] No hardcoded secrets, tokens, or credentials
- [ ] Input validation on all new API endpoints
- [ ] JWT validation not bypassed for protected routes
- [ ] IAM permissions follow least privilege
- [ ] No sensitive data in logs
- [ ] Dependencies audited with `npm audit`
- [ ] Error handling doesn't expose internal details
- [ ] CORS configuration is intentional and documented
- [ ] Infrastructure changes reviewed for security impact
