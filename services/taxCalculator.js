/**
 * CRA Payroll Calculator - Hybrid API Scraper
 *
 * ⚡ 6-10x faster than Selenium!
 * Uses Puppeteer for session initialization, then direct API calls
 * Maintains same interface as old Selenium version for backward compatibility
 */

import HybridCRAScraper from './HybridCRAScraper.js';

const PROVINCE_MAP = {
  'Alberta': 'ALBERTA',
  'British Columbia': 'BRITISH_COLUMBIA',
  'Manitoba': 'MANITOBA',
  'New Brunswick': 'NEW_BRUNSWICK',
  'Newfoundland and Labrador': 'NEWFOUNDLAND_AND_LABRADOR',
  'Nova Scotia': 'NOVA_SCOTIA',
  'Ontario': 'ONTARIO',
  'Prince Edward Island': 'PRINCE_EDWARD_ISLAND',
  'Quebec': 'QUEBEC',
  'Saskatchewan': 'SASKATCHEWAN',
  'Northwest Territories': 'NORTHWEST_TERRITORIES',
  'Nunavut': 'NUNAVUT',
  'Yukon': 'YUKON'
};

/**
 * Wrapper class that maintains the same interface as the old Selenium scraper
 * but uses the new HybridCRAScraper internally
 */
class CRAPayrollScraper {
  constructor() {
    this.scraper = new HybridCRAScraper({ sessionTTL: 20 * 60 * 1000 });
  }

  // Pay period frequency options matching CRA
  static PAY_FREQUENCIES = {
    'DAILY': { label: 'Daily (240 pay periods a year)', periods: 240 },
    'WEEKLY_52PP': { label: 'Weekly (52 pay periods a year)', periods: 52 },
    'BI_WEEKLY': { label: 'Biweekly (26 pay periods a year)', periods: 26 },
    'SEMI_MONTHLY': { label: 'Semi-monthly (24 pay periods a year)', periods: 24 },
    'MONTHLY_12PP': { label: 'Monthly (12 pay periods a year)', periods: 12 },
    'TEN_10PP': { label: '(10 pay periods a year)', periods: 10 },
    'THIRTEEN_13PP': { label: '(13 pay periods a year)', periods: 13 },
    'TWENTYTWO_22PP': { label: '(22 pay periods a year)', periods: 22 },
    'WEEKLY_53PP': { label: 'Weekly (53 pay periods a year)', periods: 53 },
    'BI_WEEKLY_27PP': { label: 'Biweekly (27 pay periods a year)', periods: 27 }
  };

  /**
   * Calculate payroll deductions
   *
   * @param {number} grossSalary - The gross salary amount
   * @param {string} province - Province name (e.g., "Ontario") or code (e.g., "ONTARIO")
   * @param {object} paymentDate - Payment date { year, month, day }
   * @param {string} payPeriodFrequency - Pay frequency code (default: 'MONTHLY_12PP')
   * @returns {object} Calculation results in same format as Selenium version
   */
  async calculate(grossSalary, province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
    try {
      console.log(`🚀 Using Hybrid Scraper (6-10x faster than Selenium)`);

      // Map province name to code if needed
      const provinceCode = PROVINCE_MAP[province] || province.toUpperCase().replace(/\s+/g, '_');

      // Call the hybrid scraper
      const result = await this.scraper.calculate(
        grossSalary,
        provinceCode,
        paymentDate,
        payPeriodFrequency
      );

      // Transform result to match old Selenium format
      return this.transformToSeleniumFormat(result, grossSalary, provinceCode, paymentDate, payPeriodFrequency);

    } catch (error) {
      console.error('Tax calculation error:', error.message);
      throw error;
    }
  }

  /**
   * Transform HybridCRAScraper result to match old Selenium format
   */
  transformToSeleniumFormat(hybridResult, grossSalary, province, paymentDate, payPeriodFrequency) {
    // Build result in old format - return raw numbers for frontend formatting
    return {
      // Input parameters
      input: {
        gross_salary: grossSalary,
        province: province,
        payment_date: paymentDate,
        calculation_timestamp: hybridResult.input?.calculation_timestamp || new Date().toISOString()
      },

      // Employee info (reconstructed from input)
      employee_info: {
        province: this.getProvinceName(province),
        pay_period_frequency: this.getFrequencyLabel(payPeriodFrequency),
        payment_date: `${paymentDate.year}-${paymentDate.month}-${paymentDate.day}`,
        federal_td1: hybridResult.raw?.td1ClaimAmountFed || 0,
        provincial_td1: hybridResult.raw?.td1ClaimAmountProv || 0
      },

      // Income
      income: {
        salary_or_wages: grossSalary
      },

      // Tax deductions - return raw numbers
      tax_deductions: {
        federal_tax: hybridResult.tax_deductions.federal_tax,
        provincial_tax: hybridResult.tax_deductions.provincial_tax,
        total_tax: hybridResult.tax_deductions.total_tax
      },

      // Other deductions - return raw numbers
      other_deductions: {
        cpp: hybridResult.other_deductions.cpp,
        cpp2: hybridResult.other_deductions.cpp2,
        ei: hybridResult.other_deductions.ei
      },

      // Totals - return raw numbers
      totals: {
        total_cash_income: grossSalary,
        total_deductions: hybridResult.totals.total_deductions,
        net_amount: hybridResult.totals.net_amount
      },

      // Add pay period frequency
      payPeriodFrequency: payPeriodFrequency,

      // Include raw API response for advanced usage
      _raw_api_response: hybridResult.raw,
      _scraper_type: 'hybrid-api'
    };
  }

  /**
   * Get human-readable province name from code
   */
  getProvinceName(provinceCode) {
    const reverseMap = Object.fromEntries(
      Object.entries(PROVINCE_MAP).map(([name, code]) => [code, name])
    );
    return reverseMap[provinceCode] || provinceCode.replace(/_/g, ' ');
  }

  /**
   * Get frequency label from code
   */
  getFrequencyLabel(frequencyCode) {
    return CRAPayrollScraper.PAY_FREQUENCIES[frequencyCode]?.label || frequencyCode;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.scraper) {
      await this.scraper.cleanup();
    }
  }

  /**
   * Invalidate cached session
   */
  invalidateSession() {
    if (this.scraper) {
      this.scraper.invalidateSession();
    }
  }

  // Static method to get pay frequencies
  static getPayFrequencies() {
    return CRAPayrollScraper.PAY_FREQUENCIES;
  }
}

export default CRAPayrollScraper;
