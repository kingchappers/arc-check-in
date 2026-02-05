terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = var.state_bucket
    key          = "${var.app_name}-infra-setup/terraform.tfstate"
    region       = var.aws_region
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region
}

# Get current AWS account ID for building scoped ARNs
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume_role" {
  statement {
    actions = [
      "sts:AssumeRoleWithWebIdentity",
    ]
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # Allow workflows from this repo (branches and PRs). Tighten if you only
      # want a specific branch (e.g. ref:refs/heads/main).
      values = ["repo:kingchappers/${var.app_name}:*"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "github_iam_policy_document" {
  # ---------------------------------------------------------------------------
  # S3: Terraform State Management
  # ---------------------------------------------------------------------------
  # The runner needs to read/write Terraform state files stored in S3.
  # Scoped to just the state bucket - no access to other buckets in the account.
  statement {
    sid = "TerraformStateManagement"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:s3:::${var.state_bucket}",
      "arn:aws:s3:::${var.state_bucket}/*"
    ]
  }

  # ---------------------------------------------------------------------------
  # Lambda: Function Management
  # ---------------------------------------------------------------------------
  # Manages two Lambda functions: static file server and API handler.
  # Scoped to functions matching the app name pattern only.
  statement {
    sid = "LambdaFunctionManagement"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:GetPolicy",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:TagResource",
      "lambda:ListVersionsByFunction",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:AddPermission",
      "lambda:RemovePermission",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.app_name}",
      "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.app_name}-api"
    ]
  }

  # ---------------------------------------------------------------------------
  # IAM: Role Management
  # ---------------------------------------------------------------------------
  # Creates and manages two roles: Lambda execution and API Gateway CloudWatch.
  # Scoped to roles matching the app name pattern only.
  statement {
    sid = "IAMRoleManagement"
    actions = [
      "iam:CreateRole",
      "iam:GetRole",
      "iam:DeleteRole",
      "iam:UpdateRoleDescription",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:TagRole",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-lambda-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-apigw-cw-logs-role"
    ]
  }

  # ---------------------------------------------------------------------------
  # IAM: Role Policy Attachments
  # ---------------------------------------------------------------------------
  # Attach/detach policies to the app's roles. This is separate from role
  # management because it involves different actions.
  statement {
    sid = "IAMRolePolicyAttachments"
    actions = [
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-lambda-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-apigw-cw-logs-role"
    ]
  }

  # ---------------------------------------------------------------------------
  # IAM: PassRole (Restricted)
  # ---------------------------------------------------------------------------
  # PassRole is required for Lambda and API Gateway to assume roles.
  # CRITICAL: Scoped to specific roles AND restricted to specific services
  # via condition. This prevents privilege escalation attacks where an
  # attacker could pass an admin role to a compute service they control.
  statement {
    sid = "IAMPassRole"
    actions = [
      "iam:PassRole",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-lambda-role",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.app_name}-apigw-cw-logs-role"
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com", "apigateway.amazonaws.com"]
    }
  }

  # ---------------------------------------------------------------------------
  # IAM: Policy Management
  # ---------------------------------------------------------------------------
  # Creates/manages the custom API Gateway policy. Scoped to policies
  # matching the app name pattern.
  # NOTE: apiGateway-iam-policy is the legacy name - included for migration.
  # Can be removed after the policy has been renamed in production.
  statement {
    sid = "IAMPolicyManagement"
    actions = [
      "iam:CreatePolicy",
      "iam:GetPolicy",
      "iam:DeletePolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
      "iam:CreatePolicyVersion",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.app_name}-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/apiGateway-iam-policy"
    ]
  }

  # ---------------------------------------------------------------------------
  # API Gateway: HTTP API Management
  # ---------------------------------------------------------------------------
  # Manages the API Gateway v2 HTTP API and its components (routes, stages,
  # integrations). Since API IDs are generated at creation time, we use a
  # regional wildcard but this could be further restricted with tags.
  statement {
    sid = "APIGatewayManagement"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PATCH",
      "apigateway:DELETE",
      "apigateway:PUT",
      "apigateway:TagResource",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:apigateway:${var.aws_region}::/apis",
      "arn:aws:apigateway:${var.aws_region}::/apis/*",
      "arn:aws:apigateway:${var.aws_region}::/tags/*"
    ]
  }

  # ---------------------------------------------------------------------------
  # API Gateway: Account Settings
  # ---------------------------------------------------------------------------
  # Required for configuring CloudWatch logging at the account level.
  # This is an account-wide setting, not per-API.
  statement {
    sid = "APIGatewayAccountSettings"
    actions = [
      "apigateway:GET",
      "apigateway:UpdateAccount",
      "apigateway:PATCH",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:apigateway:${var.aws_region}::/account"
    ]
  }

  # ---------------------------------------------------------------------------
  # CloudWatch Logs: Log Group Management
  # ---------------------------------------------------------------------------
  # Manages log groups for API Gateway and Lambda. Scoped to log groups
  # matching the app name pattern.
  statement {
    sid = "CloudWatchLogsManagement"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:ListTagsForResource",
      "logs:TagResource",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/${var.app_name}",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/${var.app_name}:*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.app_name}",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.app_name}:*",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.app_name}-api",
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.app_name}-api:*"
    ]
  }

  # ---------------------------------------------------------------------------
  # CloudWatch Logs: Describe (Account-Level)
  # ---------------------------------------------------------------------------
  # DescribeLogGroups doesn't support resource-level permissions - AWS requires
  # "*" for this action. This is read-only and low risk.
  statement {
    sid = "CloudWatchLogsDescribe"
    actions = [
      "logs:DescribeLogGroups",
    ]
    effect    = "Allow"
    resources = ["*"]
  }

  # ---------------------------------------------------------------------------
  # CloudWatch Logs: Resource Policies
  # ---------------------------------------------------------------------------
  # Resource policies are account-level and required for API Gateway logging.
  # AWS doesn't support resource-level permissions for these actions.
  statement {
    sid = "CloudWatchLogsResourcePolicies"
    actions = [
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DeleteResourcePolicy",
    ]
    effect = "Allow"
    resources = [
      "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
    ]
  }
}

resource "aws_iam_policy" "github_actions_iam_policy" {
  name        = "github-actions-iam-policy"
  description = "A policy to allow GitHub Actions to deploy to AWS for the arc-check-in project."
  policy      = data.aws_iam_policy_document.github_iam_policy_document.json
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_actions_role" {
  name               = "github-actions"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "github_actions_role_policy_attach" {
  role       = aws_iam_role.github_actions_role.name
  policy_arn = aws_iam_policy.github_actions_iam_policy.arn
}
