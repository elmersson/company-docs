# Phase 9 - Approval Synced Merge

**Duration:** 1-2 days
**Dependencies:** Phase 6 (docs PR exists), Phase 4 (GitHub Action in source repo)
**Outcome:** When a source PR merges, the corresponding docs PR auto-merges immediately

---

## Objective

Docs must always match production. When a developer merges their PR in `loan-api`, the corresponding docs PR in `company-docs` should merge automatically — no manual intervention required.

---

## Mechanism: Repository Dispatch

The source repo notifies `company-docs` when its PR merges via GitHub's `repository_dispatch` event.

### Step 1: Source Repo Notification

Add a second workflow to each source repo (or extend the existing one):

#### `.github/workflows/docs-merge-notify.yml` (in source repo)

```yaml
name: Notify Docs on Merge
on:
  pull_request:
    types: [closed]

jobs:
  notify:
    # Only run if the PR was actually merged (not just closed)
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Notify company-docs
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DOCS_REPO_TOKEN }}
          repository: your-org/company-docs
          event-type: source-pr-merged
          client-payload: |
            {
              "service": "loan-api",
              "prNumber": ${{ github.event.pull_request.number }},
              "sourceRepo": "${{ github.repository }}",
              "sourcePrUrl": "${{ github.event.pull_request.html_url }}",
              "mergedBy": "${{ github.event.pull_request.merged_by.login }}",
              "mergedAt": "${{ github.event.pull_request.merged_at }}"
            }
```

### Step 2: Auto-Merge Workflow in company-docs

#### `.github/workflows/auto-merge-docs.yml`

```yaml
name: Auto-Merge Documentation PRs
on:
  repository_dispatch:
    types: [source-pr-merged]

  # Also handle source PR closed without merging
  # (clean up orphaned docs PRs)
  workflow_dispatch:
    inputs:
      action:
        description: "Action to perform"
        required: true
        default: "cleanup"
        type: choice
        options:
          - cleanup
          - merge

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.event_name == 'repository_dispatch'
    steps:
      - name: Extract payload
        id: payload
        run: |
          echo "service=${{ github.event.client_payload.service }}" >> $GITHUB_OUTPUT
          echo "pr_number=${{ github.event.client_payload.prNumber }}" >> $GITHUB_OUTPUT
          echo "source_repo=${{ github.event.client_payload.sourceRepo }}" >> $GITHUB_OUTPUT

      - name: Find matching docs PR
        id: find-pr
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          BRANCH="docs/${{ steps.payload.outputs.service }}/pr-${{ steps.payload.outputs.pr_number }}"

          # Find open PR with this branch
          PR_NUMBER=$(gh pr list \
            --repo ${{ github.repository }} \
            --head "$BRANCH" \
            --state open \
            --json number \
            --jq '.[0].number // empty')

          if [ -z "$PR_NUMBER" ]; then
            echo "No matching docs PR found for branch: $BRANCH"
            echo "found=false" >> $GITHUB_OUTPUT
          else
            echo "Found docs PR #$PR_NUMBER"
            echo "found=true" >> $GITHUB_OUTPUT
            echo "pr_number=$PR_NUMBER" >> $GITHUB_OUTPUT
          fi

      - name: Auto-merge docs PR
        if: steps.find-pr.outputs.found == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR_NUMBER=${{ steps.find-pr.outputs.pr_number }}

          # Add a comment noting the auto-merge reason
          gh pr comment $PR_NUMBER \
            --repo ${{ github.repository }} \
            --body "Auto-merging: source PR in ${{ steps.payload.outputs.source_repo }} has been merged.

          Merged by: ${{ github.event.client_payload.mergedBy }}
          Merged at: ${{ github.event.client_payload.mergedAt }}"

          # Merge the PR (squash to keep history clean)
          gh pr merge $PR_NUMBER \
            --repo ${{ github.repository }} \
            --squash \
            --delete-branch \
            --admin

          echo "Successfully merged docs PR #$PR_NUMBER"

  # Cleanup job: close docs PRs whose source PRs were closed without merging
  cleanup-closed:
    runs-on: ubuntu-latest
    if: github.event_name == 'repository_dispatch'
    steps:
      - name: Check if this is a close-without-merge event
        run: |
          # This job only handles the case where the dispatch indicates
          # the source PR was closed, which we handle in the source repo
          # by also dispatching on close events if needed.
          echo "Cleanup check complete"

  # Scheduled cleanup for orphaned docs PRs
  scheduled-cleanup:
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.action == 'cleanup'
    steps:
      - name: Find stale docs PRs
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Find all open docs PRs older than 7 days
          STALE_PRS=$(gh pr list \
            --repo ${{ github.repository }} \
            --state open \
            --label "auto-generated" \
            --json number,headRefName,createdAt \
            --jq '.[] | select(.createdAt < (now - 604800 | todate)) | .number')

          for PR in $STALE_PRS; do
            echo "Closing stale docs PR #$PR"
            gh pr close $PR --repo ${{ github.repository }} --delete-branch \
              --comment "Closing: source PR appears to be abandoned (>7 days old)"
          done
```

---

## Source PR Closed Without Merging

When a developer closes their PR without merging, the docs PR should also be closed:

### Addition to source repo workflow:

```yaml
# In .github/workflows/docs-merge-notify.yml (source repo)

jobs:
  notify-closed:
    if: >
      github.event.pull_request.merged == false &&
      github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Notify company-docs of closure
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DOCS_REPO_TOKEN }}
          repository: your-org/company-docs
          event-type: source-pr-closed
          client-payload: |
            {
              "service": "loan-api",
              "prNumber": ${{ github.event.pull_request.number }}
            }
```

### Additional handler in auto-merge workflow:

```yaml
  close-orphaned:
    runs-on: ubuntu-latest
    if: >
      github.event_name == 'repository_dispatch' &&
      github.event.action == 'source-pr-closed'
    steps:
      - name: Close orphaned docs PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          BRANCH="docs/${{ github.event.client_payload.service }}/pr-${{ github.event.client_payload.prNumber }}"

          PR_NUMBER=$(gh pr list \
            --repo ${{ github.repository }} \
            --head "$BRANCH" \
            --state open \
            --json number \
            --jq '.[0].number // empty')

          if [ -n "$PR_NUMBER" ]; then
            gh pr close $PR_NUMBER \
              --repo ${{ github.repository }} \
              --delete-branch \
              --comment "Closing: source PR was closed without merging."
          fi
```

---

## Complete Lifecycle Diagram

```
Source PR Created
    |
    v
docs-sync action runs
    |
    v
Docs PR created in company-docs
(branch: docs/loan-api/pr-482)
    |
    +--- Source PR updated (new commits)
    |    |
    |    v
    |    docs-sync runs again
    |    |
    |    v
    |    Docs branch force-pushed, docs PR updated
    |
    +--- Source PR MERGED
    |    |
    |    v
    |    repository_dispatch: source-pr-merged
    |    |
    |    v
    |    auto-merge-docs.yml triggers
    |    |
    |    v
    |    Docs PR squash-merged, branch deleted
    |    |
    |    v
    |    build-site.yml triggers (push to main)
    |    |
    |    v
    |    Astro site rebuilt and deployed
    |
    +--- Source PR CLOSED (not merged)
         |
         v
         repository_dispatch: source-pr-closed
         |
         v
         Docs PR closed, branch deleted
```

---

## Required Permissions

| Token/Permission | Where | Why |
|---|---|---|
| `DOCS_REPO_TOKEN` (PAT) | Source repo secret | To dispatch events to company-docs |
| `GITHUB_TOKEN` (built-in) | company-docs workflow | To merge/close PRs in company-docs |
| `--admin` flag on merge | company-docs workflow | Bypass branch protection for auto-merge |

Note: The `--admin` flag requires the `GITHUB_TOKEN` to have admin access, or the token owner to be an admin of the repo. If branch protection is strict, consider using a GitHub App instead of a PAT for the merge step.

---

## Acceptance Criteria

- [ ] Source PR merge triggers docs PR auto-merge
- [ ] Source PR close (without merge) triggers docs PR close
- [ ] Docs PR squash-merged with clean commit message
- [ ] Docs branch deleted after merge/close
- [ ] Astro site build triggered by docs merge
- [ ] Stale docs PRs cleaned up (>7 days with no source PR activity)
- [ ] No manual intervention required for the happy path
