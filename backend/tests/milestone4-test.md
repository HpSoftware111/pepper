# Milestone 4: Dashboard Integration - Test Guide

## Overview

Milestone 4 integrates Master Case Documents (MCDs) with the dashboard, displaying real case data instead of mock data.

## Changes Made

### 1. Created `useMCDData` Hook
- Fetches all MCDs from the API
- Calculates statistics (total cases, active cases, upcoming deadlines, documents)
- Identifies priority cases based on urgent deadlines
- Generates recent activity feed from MCD data
- Provides loading and error states

### 2. Updated Dashboard Components

#### SummaryCard
- Now accepts `loading` prop
- Displays loading state while fetching data
- Shows real statistics from MCDs

#### PriorityCases
- Accepts `priorityCases` prop from hook
- Displays cases with urgent/pending deadlines
- Shows deadline information
- Displays urgent count badge

#### RecentActivity
- Accepts `activities` prop from hook
- Shows MCD creation events
- Shows document upload events
- Shows upcoming deadline reminders
- Sorted by recency

#### Dashboard Page
- Uses `useMCDData` hook to fetch data
- Passes real data to all components
- Handles loading states

## Statistics Calculation

### Total Cases
- Count of all MCDs for the user

### Active Cases
- Cases with status: `new`, `review`, `in_progress`, `appeals`, `pending_decision`
- Excludes `closed` cases

### Upcoming Deadlines
- Deadlines within 7 days
- Only incomplete deadlines (`completed: false`)

### Total Documents
- Sum of all `last_documents` arrays across all MCDs

## Priority Cases Logic

1. **Urgent Cases**: Deadlines within 3 days
2. **Pending Cases**: Deadlines within 7 days (but not urgent)
3. Sorted by urgency first, then by deadline date
4. Limited to 5 cases for display

## Recent Activity Logic

1. **MCD Created**: When a case is created
2. **Document Uploaded**: When documents are added to a case
3. **Deadline Upcoming**: Deadlines within 7 days
4. Sorted by time (most recent first)
5. Limited to 5 activities

## Testing

### Manual Testing

1. **Create Test Cases**:
   ```typescript
   // Use questionnaire or document extraction to create MCDs
   await mcdClient.submitQuestionnaire({
     case_id: 'TEST-001',
     parties: { plaintiff: 'Test Plaintiff', defendant: 'Test Defendant' },
     case_type: 'Test Case',
     status: 'in_progress',
     deadlines: [
       {
         title: 'Urgent Deadline',
         due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
         case_id: 'TEST-001',
         owner: 'Test Owner',
         completed: false,
       },
     ],
   });
   ```

2. **Check Dashboard**:
   - Open dashboard page
   - Verify statistics update
   - Check priority cases appear
   - Verify recent activities show

3. **Test Loading States**:
   - Check loading indicators appear
   - Verify empty states when no data

### Expected Behavior

- **With No Cases**: Shows 0 for all statistics, empty priority cases, empty activities
- **With Cases**: Shows accurate counts and lists
- **Loading**: Shows "Loading..." text
- **Errors**: Should handle gracefully (check console)

## Integration Points

### API Endpoints Used
- `GET /api/mcd` - Fetches all MCDs for user

### Data Flow
1. Dashboard page loads
2. `useMCDData` hook fetches MCDs
3. Hook calculates statistics and processes data
4. Components receive processed data
5. Components render with real data

## Future Enhancements

- Real-time updates (polling or WebSocket)
- Refresh button
- Error retry mechanism
- Filtering and sorting options
- Pagination for large datasets
- Case detail navigation from priority cases

