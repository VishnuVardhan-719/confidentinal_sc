# Archived branches

Deleted from GitHub on 2026-11-20 after `main`, `develop` and `integ/all` were aligned at `50ccdd2`. Every commit of these branches is already in `main`, so nothing was lost. To restore one: `git push origin <commit>:refs/heads/<branch>`.

| Branch | Commit |
|---|---|
| `chore/R6-seed` | `b2dbcd0bc8a9f944b423cf5a83db5deba139a391` |
| `chore/ci-workflow` | `4fc9c00c15b6c8039ad5cee47dc9d59a5da4f280` |
| `docs/H01-handover` | `738a585145dcdc3f007d43222faf706e002d2442` |
| `docs/N01-notifications-design` | `8221719d920dd66c47a13a67687070b7e0b9ed02` |
| `docs/P5-shared-engine-contract` | `9d7f4f368e50853fe008f459a3e9b8c40e62e222` |
| `docs/Q01-test-plan` | `4dac1d902efc2e3b1b2a34fde46b07453691c456` |
| `feat/DC-clinical-core` | `effa25aff234ed0f4361818432f9c5ea3eae726f` |
| `feat/DC-extras` | `313ea566ea733d5eeda5f31e182a5fea7a797ba7` |
| `feat/N01-notifications` | `01898e65f3df58b86f00f1a81e1c3ca93043499a` |
| `feat/P01-app-layer` | `6862d72a43202166ab63630afbaf495ebf62313e` |
| `feat/P01a-sql` | `e76ddefcbcb0042215872562bcfd76bfed02ab83` |
| `feat/P5-ambulance` | `87995df48bcac8935a1c8f8ceed468ca0b833c5b` |
| `feat/P5-care` | `8be53b50ad4552aee6ee403422664cf027c6e965` |
| `feat/P5-lab` | `dd25ed0a765b46448ef5038d1f3cd1434f7ceba8` |
| `feat/P5-shared-api` | `fcf1a1ad07c7cc24c136f8bae0c5b559e5d224aa` |
| `feat/P5-shared-engine` | `5b5d572c9f9c70100d6a63bfc1d7bbfec0057b99` |
| `feat/S01-doctor-core` | `1181650b49cd80fe33bad866ca425b82f87dc659` |
| `fix/availability-by-reference` | `8680be89e1df8e3392c6e7a99ca447b6c190c731` |
| `fix/review-findings` | `98eee9d30b29d276304006f9e1fcb37c9e5afc51` |
| `fix/storage-upload-readback` | `674fec0951971dba366a61bd2a1af01da7ddb022` |
| `integ/b01-fixes` | `1c3afcac8f3e263c6335ad16a596cf872fbb4314` |
| `integ/friend-backend` | `b4918dbb2edfbae619b6febf9f1446519e7534be` |
| `task/B01-booking` | `e8a71ede046ec88cde71cf243adc54b1e64460ac` |
| `task/F01-foundation` | `9d5f6899c4ad28983f9b2e98fee95d054b1ded9c` |
| `task/I01-auth-rls` | `1efbab054e7f744595e3760b49d27c24120aeed1` |
| `task/I02-provider-onboarding` | `34811b8de198b552aa21d7a4b5d74ea893425e23` |
| `task/P01-design-v1.2` | `7f6e0fd245249f42be18cb1b9d864d1996b29f43` |
| `task/P5-ambulance-design` | `4b3bf775938b7159fc5c30a6a0a3b6a73f9c32f2` |
| `task/P5-care-design` | `74f5cc1e393fcf8851a8d8b92c082ee2516ea3bc` |
| `task/P5-doctor-design` | `90ecfde94331821b5245b4fcab802c2f793218b7` |
| `task/P5-lab-design` | `280e4bccf02b09d202adf0fc834e4a98abe23f22` |
| `task/R01-source-audit` | `141d82b2bf1590f81d393baf0e81fd6956859eb9` |
| `task/S00-erd-draft` | `87f5b5ffb10f4ab1537e196761325b6499d8bbbe` |
| `task/docs-ic-fixes` | `5d33bfe4e9596970e4563d1542ad1befc58394d1` |
| `test/Q01-gaps` | `6ed9995a25239a3871b712ee4836da5de9d83920` |

## Superseded, not merged (deleted 2026-11-20)

These held early drafts that later branches replaced. Their commits are **not** in `main`. Local refs `refs/archive/<branch>` in `C:\SURECUREVISIT` keep them; restore with `git push origin <commit>:refs/heads/<branch>`. Deleting `docs/backend-handoff` closed its open PR.

| Branch | Commit | Commits not in `main` |
|---|---|---|
| `docs/backend-handoff` | `2b0506e2e32549d52ab13dc2330421287322632f` | 4 |
| `docs/backend-status` | `6ef6dc06c3eba721a98fa784462b876ada32bf66` | 1 |
| `docs/handoff-2026-11-18` | `5d837fd51d197e478a17a224f62b6028236d1623` | 1 |
| `ours/I02-provider-onboarding` | `21989aafa806a079295eb42bc3eb5a5b6921e334` | 7 |
| `task/C01-catalog` | `373251fd40d596a66767bdef934b71e8f69558a7` | 1 |
| `task/P01-design` | `a1c32fb80a74e1a8961e546089c943cc92928088` | 7 |
| `task/S01-design` | `e2abee9e56ba7d58b44205089e3c27c19baaf95b` | 7 |
| `wip/B01-fix-round1` | `7801cbb73cdfbe07d83246660b237fe8d9138ba9` | 1 |
| `wip/Q01a-rls-runner` | `2a5501469734b9f078a304995b9ea1b4f43cc14a` | 2 |
