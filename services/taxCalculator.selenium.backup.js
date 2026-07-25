/**
 * CRA Payroll Calculator Scraper
 * Uses Selenium WebDriver with headless Chrome to scrape CRA tax calculations
 */

import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const CRA_BASE_URL = 'https://apps.cra-arc.gc.ca/ebci/rhpd/beta/';

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

class CRAPayrollScraper {
  constructor() {
    this.driver = null;
    this.baseUrl = CRA_BASE_URL;
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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async initDriver() {
    const options = new chrome.Options();
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-extensions');

    this.driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    await this.driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
    console.log('✓ ChromeDriver initialized');
    await this.sleep(2000);
  }

  async navigateToCalculator() {
    console.log('🔗 Navigating to CRA Salary Calculator...');
    await this.driver.get(this.baseUrl);
    await this.driver.wait(until.urlContains('entry'), 10000);
    await this.sleep(3000);

    await this.driver.wait(async () => {
      const script = `
        const elements = Array.from(document.querySelectorAll('a, button, div'));
        return elements.some(el => el.textContent.trim().includes('Salary'));
      `;
      return await this.driver.executeScript(script);
    }, 15000);

    const clicked = await this.driver.executeScript(`
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      const salaryEl = elements.find(el => el.textContent.trim().includes('Salary'));
      if (salaryEl) { salaryEl.click(); return true; }
      return false;
    `);

    if (!clicked) throw new Error('Could not find Salary option');

    await this.sleep(2000);
    const nextButton = await this.driver.wait(
      until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
      10000
    );
    await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
    await this.sleep(1000);
    await nextButton.click();

    await this.sleep(3000);
    const pageSource = await this.driver.getPageSource();
    if (pageSource.includes('server-side application error')) {
      await this.sleep(2000);
      await this.driver.executeScript(`
        const elements = Array.from(document.querySelectorAll('a, button, div, span'));
        const salaryEl = elements.find(el => el.textContent.trim().includes('Salary'));
        if (salaryEl) salaryEl.click();
      `);
      await this.sleep(2000);
      const nextBtn2 = await this.driver.findElement(By.xpath("//button[contains(text(), 'Next')]"));
      await this.driver.executeScript("arguments[0].click();", nextBtn2);
      await this.sleep(3000);
    }

    await this.driver.wait(until.urlContains('step1'), 15000);
    console.log('✓ Step 1 ready');
  }

  async fillEmployeeInfo(province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
    console.log('📝 Step 1: Filling employee information...');
    console.log(`   Province: ${province}, Pay Frequency: ${payPeriodFrequency}`);
    await this.driver.wait(until.elementLocated(By.css('select')), 10000);
    const allSelects = await this.driver.findElements(By.css('select'));

    // Set Province
    for (const selectElem of allSelects) {
      try {
        const options = await selectElem.findElements(By.css('option'));
        const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));
        if (optionValues.includes(province)) {
          await this.driver.executeScript(
            `arguments[0].value = '${province}'; arguments[0].dispatchEvent(new Event('change'));`,
            selectElem
          );
          await this.sleep(1000);
          break;
        }
      } catch (e) { continue; }
    }

    // Set Pay Period Frequency (now configurable)
    const frequency = payPeriodFrequency || 'MONTHLY_12PP';
    for (const selectElem of allSelects) {
      try {
        const options = await selectElem.findElements(By.css('option'));
        const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));
        if (optionValues.includes(frequency)) {
          await this.driver.executeScript(
            `arguments[0].value = '${frequency}'; arguments[0].dispatchEvent(new Event('change'));`,
            selectElem
          );
          await this.sleep(1000);
          break;
        }
      } catch (e) { continue; }
    }

    // Set Payment Date
    const yearSelect = await this.driver.findElement(By.id('datePaidYear'));
    await yearSelect.sendKeys(paymentDate.year);
    await this.sleep(500);

    const freshSelects = await this.driver.findElements(By.css('select'));
    for (const selectElem of freshSelects) {
      try {
        const options = await selectElem.findElements(By.css('option'));
        const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));
        if (optionValues.includes('01') && optionValues.includes('12') && optionValues.length === 13) {
          await this.driver.executeScript(
            `arguments[0].value = '${paymentDate.month}'; arguments[0].dispatchEvent(new Event('change'));`,
            selectElem
          );
          await this.sleep(500);
          break;
        }
      } catch (e) { continue; }
    }

    const freshSelects2 = await this.driver.findElements(By.css('select'));
    for (const selectElem of freshSelects2) {
      try {
        const options = await selectElem.findElements(By.css('option'));
        const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));
        if (optionValues.includes('01') && optionValues.includes('31') && optionValues.length === 32) {
          await this.driver.executeScript(
            `arguments[0].value = '${paymentDate.day}'; arguments[0].dispatchEvent(new Event('change'));`,
            selectElem
          );
          break;
        }
      } catch (e) { continue; }
    }

    await this.sleep(2000);
    const nextButton = await this.driver.wait(
      until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
      20000
    );
    await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
    await this.sleep(500);
    await nextButton.click();
    await this.driver.wait(until.urlContains('step2'), 10000);
    console.log('✓ Step 1 completed');
  }

  async fillSalaryInfo(grossSalary) {
    console.log('📝 Step 2: Filling salary information...');
    const formattedSalary = grossSalary.toFixed(2);

    await this.driver.wait(until.elementLocated(By.css('input[type="text"]')), 10000);
    const inputs = await this.driver.findElements(By.css('input[type="text"]'));

    let salaryEntered = false;
    for (const input of inputs) {
      try {
        const id = await input.getAttribute('id');
        const name = await input.getAttribute('name');
        if ((id && id.toLowerCase().includes('salary')) || (name && name.toLowerCase().includes('salary'))) {
          await input.clear();
          await input.sendKeys(formattedSalary);
          salaryEntered = true;
          break;
        }
      } catch (e) { continue; }
    }

    if (!salaryEntered) {
      await inputs[0].clear();
      await inputs[0].sendKeys(formattedSalary);
    }

    await this.sleep(1000);

    // Select "No bonus"
    const radioButtons = await this.driver.findElements(By.css('input[type="radio"]'));
    for (const radio of radioButtons) {
      try {
        const value = await radio.getAttribute('value');
        const id = await radio.getAttribute('id');
        if (value === 'false' || (id && id.includes('false'))) {
          await this.driver.executeScript("arguments[0].click();", radio);
          break;
        }
      } catch (e) { continue; }
    }

    await this.sleep(1000);
    const nextButton = await this.driver.wait(
      until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
      10000
    );
    await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
    await this.sleep(500);
    await nextButton.click();
    await this.driver.wait(until.urlContains('step3'), 10000);
    console.log('✓ Step 2 completed');
  }

  async processAdditionalInfo() {
    console.log('📝 Step 3: Processing and calculating...');
    await this.driver.wait(until.elementLocated(By.css('button')), 10000);
    const buttons = await this.driver.findElements(By.css('button'));

    for (const button of buttons) {
      try {
        const text = await button.getText();
        if (text && text.toLowerCase().includes('calculate')) {
          await this.driver.executeScript("arguments[0].scrollIntoView(true);", button);
          await this.sleep(500);
          await this.driver.executeScript("arguments[0].click();", button);
          break;
        }
      } catch (e) { continue; }
    }

    await this.driver.wait(until.urlContains('results'), 15000);
    console.log('✓ Step 3 completed');
  }

  async extractResults(grossSalary, province, paymentDate) {
    console.log('📝 Step 4: Extracting results...');
    await this.sleep(4000);

    const allData = await this.driver.executeScript(`
      const results = {
        employee_info: {},
        income: {},
        tax_deductions: {},
        other_deductions: {},
        totals: {}
      };

      const dts = document.querySelectorAll('dt');
      dts.forEach(dt => {
        const label = dt.textContent.trim();
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const value = dd.textContent.trim();
          if (label.includes('Province of employment')) {
            results.employee_info.province = value;
          } else if (label.includes('Pay period frequency')) {
            results.employee_info.pay_period_frequency = value;
          } else if (label.includes('Date the employee is paid')) {
            results.employee_info.payment_date = value;
          } else if (label.includes('Federal amount from TD1')) {
            results.employee_info.federal_td1 = value;
          } else if (label.includes('Provincial amount from TD1') || label.includes('Territorial amount from TD1')) {
            results.employee_info.provincial_td1 = value;
          }
        }
      });

      const trs = document.querySelectorAll('tr');
      trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 2) {
          const label = tds[0].textContent.trim();
          let value = null;
          for (let i = 1; i < tds.length; i++) {
            const text = tds[i].textContent.trim();
            if (text && text !== '') {
              value = text;
              break;
            }
          }
          if (!value) return;

          if (label.includes('Salary or wages income')) {
            results.income.salary_or_wages = value;
          } else if (label.includes('Total cash income')) {
            results.totals.total_cash_income = value;
          } else if (label.includes('Federal tax deduction')) {
            results.tax_deductions.federal_tax = value;
          } else if (label.includes('Provincial tax deduction') || label.includes('Territorial tax deduction')) {
            results.tax_deductions.provincial_tax = value;
          } else if (label.includes('Total tax deductions')) {
            results.tax_deductions.total_tax = value;
          } else if (label.includes('CPP deductions') && !label.includes('CPP2')) {
            results.other_deductions.cpp = value;
          } else if (label.includes('CPP2 deductions')) {
            results.other_deductions.cpp2 = value;
          } else if (label.includes('EI deductions')) {
            results.other_deductions.ei = value;
          } else if (label === 'Total deductions') {
            results.totals.total_deductions = value;
          } else if (label.includes('Net amount')) {
            results.totals.net_amount = value;
          }
        }
      });

      return results;
    `);

    allData.input = {
      gross_salary: grossSalary,
      province: province,
      payment_date: paymentDate,
      calculation_timestamp: new Date().toISOString()
    };

    console.log('✓ Results extracted');
    return allData;
  }

  async calculate(grossSalary, province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
    try {
      // Map province name to code
      const provinceCode = PROVINCE_MAP[province] || province.toUpperCase().replace(/\s+/g, '_');

      await this.initDriver();
      await this.navigateToCalculator();
      await this.fillEmployeeInfo(provinceCode, paymentDate, payPeriodFrequency);
      await this.fillSalaryInfo(grossSalary);
      await this.processAdditionalInfo();
      const results = await this.extractResults(grossSalary, provinceCode, paymentDate);
      results.payPeriodFrequency = payPeriodFrequency;
      return results;
    } catch (error) {
      console.error('Tax calculation error:', error.message);
      throw error;
    } finally {
      if (this.driver) {
        await this.driver.quit();
      }
    }
  }

  // Static method to get pay frequencies
  static getPayFrequencies() {
    return CRAPayrollScraper.PAY_FREQUENCIES;
  }
}

export default CRAPayrollScraper;
