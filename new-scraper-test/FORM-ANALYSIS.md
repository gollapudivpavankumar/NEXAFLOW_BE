# Form Submission Analysis

## Flow Discovered

1. `GET https://apps.cra-arc.gc.ca/ebci/rhpd/beta/`
2. `GET https://canada.demdex.net/dest5.html?d_nsid=0`

## Key Findings

- **API endpoints found!**
  - `POST https://canada.tt.omtrdc.net/rest/v1/delivery?client=canada&sessionId=5d809bd421514f7fad52dcb653f886c4&version=2.11.4`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/log/noop`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/validateGeneralData`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimAmounts`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimCodes`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimCodes`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/validate`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimCodes`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/isFedProvTaxExemptDisplay`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculate`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimCodes`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateClaimCodes`
  - `POST https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/calculator/SALARY/calculateResultClaimCode`
