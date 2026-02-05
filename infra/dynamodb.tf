# ============================================================================
# DynamoDB Table for Check-In Sessions
# ============================================================================

resource "aws_dynamodb_table" "checkin_sessions" {
  name         = "${var.app_name}-checkin-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "checkInTime"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "checkInTime"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

output "dynamodb_table_name" {
  value       = aws_dynamodb_table.checkin_sessions.name
  description = "DynamoDB table name for check-in sessions"
}

output "dynamodb_table_arn" {
  value       = aws_dynamodb_table.checkin_sessions.arn
  description = "DynamoDB table ARN for check-in sessions"
}
