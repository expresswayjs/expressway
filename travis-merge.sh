if [ "$TRAVIS_BRANCH" != "dev" ]; then
    exit 0;
fi
export GIT_COMMITTER_EMAIL="<temitayo@camelcase.co>"
export GIT_COMMITTER_NAME="<Temitayo Bodunrin>"
git config --add remote.origin.fetch +refs/heads/*:refs/remotes/origin/* || exit
git fetch --all || exit
git checkout master || exit
git merge --no-ff "$TRAVIS_COMMIT" || exit
git push @github.com/">https://${GITHUB_TOKEN}@github.com/expresswayjs/expressway.git