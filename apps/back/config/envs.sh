export VERSION=$(node -p "require('./package.json').version")

export REGION=us-east-1

if [ -z "$1" ]; then
  LAMBDA_FUNCTIONS=("api-express")
else
  LAMBDA_FUNCTIONS=($1)
fi

#LAMBDA_FUNCTIONS=("api-export")

export LAMBDA_FUNCTIONS
