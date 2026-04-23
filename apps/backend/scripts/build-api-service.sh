BUILD_FOLDER="tmp-folder-api-service"
rm -rf $BUILD_FOLDER
mkdir $BUILD_FOLDER
cp package.json ./$BUILD_FOLDER
cp tsconfig.json ./$BUILD_FOLDER
cp -r src ./$BUILD_FOLDER
cd $BUILD_FOLDER
yarn
yarn build
if [ $? -eq 0 ]; then
    echo OK
else
    echo "build FAILED"
    exit 1
fi

cp package.json ./build
VERSION=$(node -p "require('./package.json').version")
echo VERSION=$VERSION >./build/.env
cd ./build
#https://github.com/yarnpkg/yarn/issues/2221#issuecomment-1168971270
#npm_config_target_arch=x64 npm_config_target_platform=linux npm_config_target_libc=glibc yarn install --production
npm_config_target_arch=arm64 npm_config_target_platform=linux npm_config_target_libc=glibc yarn install --production
rm package.json
rm yarn.lock
cp -r ../../.ebextensions ./.ebextensions
cp -r ../../.platform ./.platform
zip -r vaquita-service-build.zip .
mv -f vaquita-service-build.zip ../../builds/api-service/vaquita-service-build-v$VERSION.zip
cd ../../
rm -rf $BUILD_FOLDER
echo Built: $VERSION
exit 0
