const cp = require('child_process');
const p = require('path');
const fs = require('fs');

function execSync(cmd) {
  cp.execSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'] });
}

function execSyncRead(cmd) {
  return String(cp.execSync(cmd, { stdio: ['inherit', 'pipe', 'inherit'] })).trim();
}

function execSyncSilently(cmd) {
  cp.execSync(cmd, { stdio: ['ignore', 'ignore', 'ignore'] });
}

function validateEnv() {
  if (!process.env.CI || !process.env.TRAVIS) {
    throw new Error(`releasing is only available from Travis CI`);
  }

  if (process.env.TRAVIS_BRANCH !== 'master') {
    console.error(`not publishing on branch ${process.env.TRAVIS_BRANCH}`);
    return false;
  }

  if (process.env.TRAVIS_PULL_REQUEST !== 'false') {
    console.error(`not publishing as triggered by pull request ${process.env.TRAVIS_PULL_REQUEST}`);
    return false;
  }

  return true;
}

function setupGit() {
  execSyncSilently(`git config --global push.default simple`);
  execSyncSilently(`git config --global user.email "${process.env.GIT_EMAIL}"`);
  execSyncSilently(`git config --global user.name "${process.env.GIT_USER}"`);
  const remoteUrl = new RegExp(`https?://(\\S+)`).exec(execSyncRead(`git remote -v`))[1];
  execSyncSilently(`git remote remove origin`);
  execSyncSilently(`git remote add origin "https://${process.env.GIT_USER}:${process.env.GIT_TOKEN}@${remoteUrl}"`);
  execSync(`git checkout master`);
}

function copyNpmRc() {
  const npmrcPath = p.resolve(`${__dirname}/.npmrc`);
  execSync(`cp -rf ${npmrcPath} .`);
}

function generateArtifacts() {
  let packageJsonVersion = JSON.parse(execSyncRead(`cat ${p.resolve('detox/package.json')}`)).version;

  try {
    execSync(`cd detox/android && ./gradlew clean detox:publish -PVERSION=${packageJsonVersion}`);
    execSync('cd ../../');
  } catch (e) {
    console.log('Could not generate artifacts');
    return;
  }

  const flavorVersions = [44, 46];

  const artifacts = [].concat.apply([], ['-javadoc.jar', '-sources.jar', '.aar', '.pom'].map(suffix => {
    return flavorVersions.map(version => `minReactNative${version}Release`).map(flavor => {
      return `detox-${packageJsonVersion}-${flavor}${suffix}`;
    })
  }));

  artifacts.forEach(name => {
    flavorVersions.forEach(flavor => {
      if (name.includes(flavor)){
        if (!fs.existsSync(`detox/DetoxAndroid/com/wix/detox/${packageJsonVersion}-minReactNative${flavor}Release/${name}`)) {
          console.log(`file ${name} was not generated`);
          return;
        }
      }
    })
  });
}

function release() {
  execSync(`scripts/publish.sh`);
}

function run() {
  if (!validateEnv()) {
    return;
  }
  setupGit();
  copyNpmRc();
  generateArtifacts();
  release();
}

run();
