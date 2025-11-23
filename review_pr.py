#!/usr/bin/env python3
"""
AI PR Reviewer with RAG - Reviews pull requests using GPT-4
"""
import os
import sys
import argparse
import subprocess
import json
from pathlib import Path
from github import Github
from openai import OpenAI
import requests


def get_pr_diff(github_token, repo_full_name, pr_number):
    """Get the diff for a pull request"""
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3.diff"
    }
    url = f"https://api.github.com/repos/{repo_full_name}/pulls/{pr_number}"
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.text


def get_changed_files(github_token, repo_full_name, pr_number):
    """Get list of changed files in the PR"""
    headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    url = f"https://api.github.com/repos/{repo_full_name}/pulls/{pr_number}/files"
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()


def get_file_contents(file_path):
    """Read file contents from the repository"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"


def create_review_prompt(diff, changed_files, pr_title="", pr_body=""):
    """Create a prompt for the AI reviewer"""
    
    # Summarize changed files
    file_summary = "\n".join([
        f"- {f['filename']} ({f['status']}, +{f['additions']}/-{f['deletions']})"
        for f in changed_files[:20]  # Limit to first 20 files
    ])
    
    if len(changed_files) > 20:
        file_summary += f"\n... and {len(changed_files) - 20} more files"
    
    prompt = f"""You are an expert code reviewer. Review the following pull request changes and provide constructive feedback.

Pull Request Title: {pr_title or 'N/A'}
Pull Request Description: {pr_body or 'N/A'}

Changed Files:
{file_summary}

Diff:
```
{diff[:50000]}  # Limit diff size to avoid token limits
```

Please provide a comprehensive code review focusing on:
1. Code quality and best practices
2. Potential bugs or security issues
3. Performance considerations
4. Code style and consistency
5. Documentation and comments
6. Test coverage (if applicable)

Format your review as:
- **Summary**: Brief overview
- **Issues Found**: List of issues with severity (Critical/High/Medium/Low)
- **Suggestions**: Actionable improvement suggestions
- **Positive Feedback**: What was done well

Be constructive, specific, and provide code examples when helpful."""

    return prompt


def review_with_ai(openai_client, model, prompt):
    """Use OpenAI to review the code"""
    try:
        response = openai_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert software engineer and code reviewer with deep knowledge of best practices, security, performance, and code quality."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=2000
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error during AI review: {str(e)}"


def post_pr_comment(github_token, repo_full_name, pr_number, review_body):
    """Post a comment on the pull request"""
    g = Github(github_token)
    repo = g.get_repo(repo_full_name)
    pr = repo.get_pull(int(pr_number))
    
    # Create comment with review
    comment_body = f"""## 🤖 AI Code Review

{review_body}

---
*This review was generated automatically by AI PR Reviewer*"""
    
    pr.create_issue_comment(comment_body)
    print(f"✅ Posted review comment on PR #{pr_number}")


def main():
    parser = argparse.ArgumentParser(description='AI PR Reviewer')
    parser.add_argument('--openai-api-key', required=True, help='OpenAI API key')
    parser.add_argument('--github-token', required=True, help='GitHub token')
    parser.add_argument('--openai-model', default='gpt-4-turbo-preview', help='OpenAI model to use')
    parser.add_argument('--pr-number', required=True, help='Pull request number')
    parser.add_argument('--repo', required=True, help='Repository full name (owner/repo)')
    parser.add_argument('--pr-sha', help='PR head SHA')
    
    args = parser.parse_args()
    
    print(f"📋 Reviewing PR #{args.pr_number} in {args.repo}")
    
    # Initialize OpenAI client
    openai_client = OpenAI(api_key=args.openai_api_key)
    
    # Get PR information
    try:
        print("📥 Fetching PR diff...")
        diff = get_pr_diff(args.github_token, args.repo, args.pr_number)
        
        print("📁 Fetching changed files...")
        changed_files = get_changed_files(args.github_token, args.repo, args.pr_number)
        
        # Get PR title and body
        g = Github(args.github_token)
        repo = g.get_repo(args.repo)
        pr = repo.get_pull(int(args.pr_number))
        pr_title = pr.title
        pr_body = pr.body or ""
        
        print(f"📝 PR: {pr_title}")
        print(f"📊 Changed files: {len(changed_files)}")
        
        # Create review prompt
        print("🤖 Generating AI review...")
        prompt = create_review_prompt(diff, changed_files, pr_title, pr_body)
        
        # Get AI review
        review = review_with_ai(openai_client, args.openai_model, prompt)
        
        if review.startswith("Error"):
            print(f"❌ {review}")
            sys.exit(1)
        
        # Post review as comment
        print("💬 Posting review comment...")
        post_pr_comment(args.github_token, args.repo, args.pr_number, review)
        
        print("✅ Review completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during review: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

