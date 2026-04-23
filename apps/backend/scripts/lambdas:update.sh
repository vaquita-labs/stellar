source ./config/envs.sh

build_lambda() {
  local NAME_LAMBDA=$1
  local BUILD_FOLDER="./tmp-folder-build-$NAME_LAMBDA"

  echo "    1 preparing folder \"$BUILD_FOLDER\"..."
  rm -rf $BUILD_FOLDER && mkdir  $BUILD_FOLDER && cp -r src $BUILD_FOLDER && mv $BUILD_FOLDER/src/app-$NAME_LAMBDA-lambda.ts $BUILD_FOLDER/src/app.ts && cp config/rollup-lambda.config.mjs package.json tsconfig.json lambda-api.d.ts $BUILD_FOLDER && mkdir -p builds/$VERSION && cd $BUILD_FOLDER
  [ $? -eq 0 ] && echo -e "\033[F\033[K    1 prepared folder \"$BUILD_FOLDER\": ✔" || { return 1; }

  echo "    2 compiling..."
  rollup -c rollup-lambda.config.mjs >> ../builds/$VERSION/compiling.log 2>&1
  [ $? -eq 0 ] && echo -e "\033[F\033[K    2 compiled: ✔" || { cat ../builds/$VERSION/compiling.log; return 1; }

  echo VERSION=$VERSION > build/.env

  echo "    3 compressing build..."
  cd build && zip -r $NAME_LAMBDA-build.zip . >> ../../builds/$VERSION/zip.log
  [ $? -eq 0 ] && echo -e "\033[F\033[K    3 compressed build: ✔" || { return 1; }

  echo "    4 finishing build $VERSION"
  mv -f $NAME_LAMBDA-build.zip ../../builds/$VERSION/$NAME_LAMBDA-build-v$VERSION.zip \
    && rm -rf ../../builds/latest/$NAME_LAMBDA-build-v*.zip \
    && cp ../../builds/$VERSION/$NAME_LAMBDA-build-v$VERSION.zip ../../builds/latest/$NAME_LAMBDA-build-v$VERSION.zip \
    && cd ../../ \
    && rm -rf $BUILD_FOLDER
  [ $? -eq 0 ] && echo -e "\033[F\033[K    4 finished build $VERSION: ✔" || { return 1; }

  return 0
}

initial_dir=$(pwd)

echo "1 building lambdas..."
index=0
SUCCESS_COUNT=0
ERROR_COUNT=0
for FUNCTION_NAME in "${LAMBDA_FUNCTIONS[@]}"
do
  ((index++))
  echo "  1.$index building lambda \"$FUNCTION_NAME\"..."
  cd "$initial_dir"
  build_lambda $FUNCTION_NAME
  if [ $? -eq 0 ]; then
    echo "  1.$index built lambda \"$FUNCTION_NAME\": ✔"
    ((SUCCESS_COUNT++))
  else
    echo "  1.$index build lambda with error \"$FUNCTION_NAME\": ✘"
    ((ERROR_COUNT++))
    exit 1;
  fi
done
echo "1 built lambdas: ✔($SUCCESS_COUNT) ✘($ERROR_COUNT)"

cd ./builds/$VERSION

echo "2 uploading lambdas..."
index=0
SUCCESS_COUNT=0
ERROR_COUNT=0
for FUNCTION_NAME in "${LAMBDA_FUNCTIONS[@]}"
do
  ((index++))
  echo "  2.$index uploading lambda \"$FUNCTION_NAME\"..."
  aws lambda update-function-code --function-name vaquita-"$FUNCTION_NAME"_lambda-function \
    --zip-file fileb://$FUNCTION_NAME-build-v$VERSION.zip --region $REGION >> publish-lambda.log
  if [ $? -eq 0 ]; then
    echo -e "\033[F\033[K  2.$index uploaded lambda \"$FUNCTION_NAME\": ✔"
    ((SUCCESS_COUNT++))
  else
    echo -e "\033[F\033[K  2.$index uploaded lambda \"$FUNCTION_NAME\": ✘"
    ((ERROR_COUNT++))
  fi
done

echo "2 uploaded lambdas functions: ✔($SUCCESS_COUNT) ✘($ERROR_COUNT)"
