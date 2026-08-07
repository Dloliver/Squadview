# SquadView domain migration

Copy these overwrite files into the project root, preserving the folder structure.

Then remove the obsolete GitHub Actions Pages workflow:

```bash
rm -f .github/workflows/deploy-pages.yml
```

Build and deploy with:

```bash
npm ci
npm run build
cat dist/CNAME
npm run preview
npm run deploy
```

The `cat dist/CNAME` command must output `squadview.app` before deployment.
