# Sprint Capacity Intelligence — MVP Concept

## Overview

Sprint Capacity Intelligence is a pre-sprint planning tool for Engineering Managers and Scrum Masters.

It answers one core question:

> **Is this sprint realistically achievable given the team’s available focused time?**

It does NOT track execution.  
It does NOT monitor progress during the sprint.

It only evaluates **planned workload vs. attention capacity before the sprint starts**.

---

## Target Users

- Engineering Managers
- Scrum Masters

---

## When It Is Used

- Before sprint start
- During sprint planning

---

## Core Idea

Instead of analyzing “how much work is assigned”, the product focuses on:

> **How much uninterrupted focus time the team actually has**

The key shift is from:

- workload tracking  
  to:
- focus fragmentation analysis

---

## Data Inputs (MVP Scope)

### Jira

For each sprint:

- assigned tickets
- story points
- assignees
- issue count

Not used:

- comments
- history
- transitions
- worklogs

---

### Google Calendar

For sprint duration:

- meetings
- timestamps
- durations

Not used:

- attendees
- descriptions
- recurring logic
- meeting metadata

---

## Core Concept: Context Switching

A context switch is defined as a transition between:

- work → meeting
- meeting → work

Each transition counts as 1 switch.

Example day:

- coding → meeting → coding → meeting → coding  
  = 4 switches

This keeps the model:

- simple
- explainable
- deterministic

---

## Overload Model (MVP)

The system evaluates sprint capacity using only three signals:

### 1. Workload

- Total story points per sprint
- Normalized by sprint duration

### 2. Meeting Load

- Total hours spent in meetings during sprint

### 3. Context Switching

- Number of transitions between meetings and focused work

---

## Scoring Logic (Conceptual)

A combined overload score is computed from:

- workload pressure
- meeting time burden
- context switching friction

This is mapped into risk levels:

- 🟢 Low
- 🟡 Medium
- 🔴 High
- 🔴 Critical

The product intentionally avoids overly precise numeric interpretation in the UI.

---

## Key Output Insight

Instead of answering:

- “Is the team overworked?”

It answers:

> **“How much uninterrupted focus time is actually available for the planned sprint?”**

---

## Example Output (Per Team Member)

| Person | Story Points | Meeting Hours | Switches | Risk    |
| ------ | ------------ | ------------- | -------- | ------- |
| Anna   | 24           | 18h           | 22       | 🔴 High |
| Piotr  | 15           | 7h            | 10       | 🟢 Low  |

---

## Team View

A weekly visualization showing:

- meeting density
- context switching intensity
- focus fragmentation risk

Displayed as simple daily risk indicators.

Example:

Mon Tue Wed Thu Fri  
🟢 🔴 🔴 🟡 🟢

---

## AI Summary

The system provides a short natural-language explanation of sprint risk, such as:

> “This sprint shows elevated interruption risk for backend engineers due to high meeting density and frequent context switching.”

The AI layer is descriptive, not predictive.

---

## What Makes This Product Valuable

The key insight is:

> Productivity is limited less by workload volume, and more by fragmentation of focused time.

The model highlights:

- lost deep work time due to meetings
- cognitive cost of switching contexts
- imbalance between planned scope and available focus capacity

---

## Available Focus Model (Core Insight)

Instead of only showing workload, the product estimates:

- Sprint total time
- Meeting time
- Switching penalty
- Remaining focus capacity

This is the most decision-relevant output for managers.

---

## Explicit Out of Scope

The MVP does NOT include:

- sprint execution tracking
- real-time updates
- Slack or GitHub integrations
- notifications
- velocity analytics
- burnout prediction
- delivery prediction
- behavioral analysis
- task-level monitoring during sprint
