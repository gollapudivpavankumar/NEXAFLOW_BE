# CRA Payroll Calculator API Investigation

This folder contains tools to reverse-engineer the CRA Payroll Calculator API to enable faster, more efficient payroll calculations without slow Selenium automation.

## Problem

The current implementation uses Selenium WebDriver to:
- Launch full Chrome browser (heavy)
- Navigate web pages (slow)
- Fill forms manually (20-35 seconds per calculation)
- Parse HTML results (brittle)

**Result:** Processing 50 employees takes ~21 minutes!

## Goal

Discover if CRA has an underlying REST API that we can call directly:
- Make HTTP requests instead of browser automation
- Reduce calculation time from 25s to 2-5s
- More reliable (no DOM parsing)
- Less resource intensive

## Files

### Investigation Tools

- **`api-investigator.js`** - Initial network traffic analyzer
  - Loads CRA website
  - Intercepts all network requests
  - Identifies API endpoints
  - Extracts cookies, CSRF tokens, session info

- **`full-flow-capture.js`** - Complete calculation flow capture
  - Navigates through entire form
  - Fills in all fields (province, salary, date)
  - Clicks "Calculate" button
  - Captures the exact API request/response
  - Takes screenshots of each step
  - Generates detailed report

### API Client

- **`direct-api-client.js`** - Direct HTTP API client (WIP)
  - Makes direct HTTP requests to CRA API
  - Manages session cookies and CSRF tokens
  - Bypasses Selenium entirely
  - **10x faster** than browser automation

### Configuration

- **`package.json`** - Dependencies
  - `puppeteer` - For investigation scripts
  - `axios` - For direct API calls
  - `axios-cookiejar-support` - Session management
  - `tough-cookie` - Cookie handling

## Discovered API Endpoints

### Base URL
```
https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/
```

### Known Endpoints
```
GET  /log/cfg - Get configuration
GET  /links/{lang} - Get links for language
GET  /calculator/getappversion - Get app version
GET  /calculator/getdisplaynewversionmessageuntil - Version message
POST /log/noop - Logging endpoint
POST /log - Log messages
```

### Authentication
- **XSRF-TOKEN** - Cookie-based CSRF protection
- **JSESSIONID** - Session management cookie

### Response Format
Responses are prefixed with `)]}',\n` for security (prevents JSON hijacking).

Example:
```javascript
)]}',
{"consoleLevel":2,"serverLevel":3}
```

## Usage

### 1. Run Initial Investigation
```bash
npm run investigate
```

Analyzes the page structure and identifies API endpoints.

### 2. Capture Complete Flow
```bash
node full-flow-capture.js
```

Completes the entire calculation process and captures:
- Exact API endpoint for calculations
- Required request headers
- POST payload structure
- Response format

Check generated files:
- `calculation-capture.json` - Raw data
- `API-ENDPOINT-REPORT.md` - Human-readable summary
- `step*.png` - Screenshots of each step

### 3. Test Direct API Client
```bash
node direct-api-client.js
```

Once we discover the calculation endpoint, this will:
- Initialize session
- Make direct API calls
- Return results in 2-5 seconds (vs 25 seconds with Selenium)

## Next Steps

1. ✅ Identify API base URL and authentication
2. 🔄 **IN PROGRESS:** Capture calculation endpoint
3. ⏳ Implement complete direct API client
4. ⏳ Test with various provinces and amounts
5. ⏳ Handle error cases and edge cases
6. ⏳ Integrate into main payroll backend
7. ⏳ Add caching layer (Redis)
8. ⏳ Implement background job queue

## Expected Performance Improvement

| Operation | Current (Selenium) | With Direct API | Improvement |
|-----------|-------------------|-----------------|-------------|
| Single calculation | 20-35s | 2-5s | **10x faster** |
| 10 employees | 4.3 min | 30s | **8.6x faster** |
| 50 employees | 21 min | 2 min | **10.5x faster** |
| 100 employees | 42 min | 5 min | **8.4x faster** |

*Note: With parallel processing (3-5 workers), times can be further reduced*

## Alternative: If No API Found

If CRA doesn't expose a public API, we can still improve performance:

1. **Caching** - Cache identical calculations (80-90% hit rate expected)
2. **Parallel Processing** - Run 3-5 Selenium instances concurrently
3. **Background Jobs** - Move to queue system (instant API response)
4. **Pre-calculation** - Pre-compute common salary amounts during off-peak

## Security Considerations

- Respect CRA's robots.txt and terms of service
- Implement rate limiting (don't hammer their servers)
- Use proper User-Agent headers
- Handle session management properly
- Don't store sensitive calculation data longer than necessary

## Questions?

See the main backend README or check:
- `/services/taxCalculator.js` - Current Selenium implementation
- `/routes/taxCalculator.js` - Current API endpoints
- `/services/monthlyPaymentGenerator.js` - Scheduled job using scraper
