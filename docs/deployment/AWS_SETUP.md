# AWS Deployment Guide — Kira Custom Jewelry

## Infrastructure Overview

```
Region: us-east-1

VPC: jewelflow-vpc (10.0.0.0/16)
  ├── Public Subnets: 10.0.1.0/24, 10.0.2.0/24
  │   ├── Application Load Balancer
  │   └── NAT Gateway
  └── Private Subnets: 10.0.10.0/24, 10.0.11.0/24
      ├── EC2 (NestJS API) — t3.medium
      └── RDS PostgreSQL    — db.t3.small
```

## Step 1: RDS PostgreSQL Setup

```bash
aws rds create-db-instance \
  --db-instance-identifier jewelflow-db \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 15.4 \
  --master-username jewelflow \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --storage-encrypted \
  --vpc-security-group-ids sg-xxxxxxx \
  --db-subnet-group-name jewelflow-subnet-group \
  --backup-retention-period 7
```

## Step 2: S3 Bucket for CAD Files

```bash
aws s3api create-bucket \
  --bucket jewelflow-cad-files \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket jewelflow-cad-files \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket jewelflow-cad-files \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'
```

## Step 3: EC2 for NestJS API

```bash
# Launch EC2 instance
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.medium \
  --key-name jewelflow-key \
  --security-group-ids sg-xxxxxxx \
  --subnet-id subnet-xxxxxxx \
  --iam-instance-profile Name=jewelflow-api-role \
  --user-data file://scripts/ec2-init.sh

# Set up PM2 for process management
npm install -g pm2
pm2 start dist/main.js --name jewelflow-api
pm2 startup
pm2 save
```

## Step 4: CloudFront for Frontend

```bash
# Deploy Next.js to Vercel (recommended) or S3+CloudFront
# Vercel is the fastest path for Next.js
npx vercel --prod
```

## Step 5: Redis (ElastiCache)

```bash
aws elasticache create-replication-group \
  --replication-group-id jewelflow-redis \
  --description "Kira Custom Jewelry Redis Cache" \
  --node-type cache.t3.micro \
  --num-cache-clusters 1 \
  --engine redis \
  --engine-version 7.0
```

## Environment Variables (Production)

Set these in AWS Systems Manager Parameter Store:
- `/jewelflow/prod/DB_HOST`
- `/jewelflow/prod/DB_PASSWORD`
- `/jewelflow/prod/JWT_SECRET`
- `/jewelflow/prod/RESEND_API_KEY`
- `/jewelflow/prod/CLERK_SECRET_KEY`
- `/jewelflow/prod/REDIS_HOST`

## Monitoring

- **CloudWatch** — EC2 metrics, RDS metrics, API logs
- **CloudWatch Alarms** — CPU > 80%, DB connections > 80%
- **Route53** — DNS management
- **ACM** — SSL certificates
