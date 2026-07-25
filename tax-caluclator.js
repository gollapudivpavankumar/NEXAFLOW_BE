/**
 * CRA Payroll Calculator Scraper - Express.js Monolith
 *
 * A complete, self-contained Express API for scraping CRA payroll calculations
 * using Selenium WebDriver with headless Chrome.
 *
 * Usage:
 *   node scraper-monolith.js
 *
 * API Endpoints:
 *   POST /api/calculate - Calculate payroll deductions
 *   GET  /api/provinces - Get supported provinces
 *   GET  /api/health    - Health check
 */

const express = require('express');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

const PORT = process.env.PORT || 3000;
const CRA_BASE_URL = 'https://apps.cra-arc.gc.ca/ebci/rhpd/beta/';

const PROVINCES = [
    { code: 'ALBERTA', name: 'Alberta' },
    { code: 'BRITISH_COLUMBIA', name: 'British Columbia' },
    { code: 'MANITOBA', name: 'Manitoba' },
    { code: 'NEW_BRUNSWICK', name: 'New Brunswick' },
    { code: 'NEWFOUNDLAND_AND_LABRADOR', name: 'Newfoundland and Labrador' },
    { code: 'NOVA_SCOTIA', name: 'Nova Scotia' },
    { code: 'ONTARIO', name: 'Ontario' },
    { code: 'PRINCE_EDWARD_ISLAND', name: 'Prince Edward Island' },
    { code: 'QUEBEC', name: 'Quebec' },
    { code: 'SASKATCHEWAN', name: 'Saskatchewan' },
    { code: 'NORTHWEST_TERRITORIES', name: 'Northwest Territories' },
    { code: 'NUNAVUT', name: 'Nunavut' },
    { code: 'YUKON', name: 'Yukon' }
];

// ============================================================
// Scraper Class
// ============================================================

class CRAPayrollScraper {
    constructor() {
        this.driver = null;
        this.baseUrl = CRA_BASE_URL;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Initialize Chrome WebDriver
     */
    async initDriver() {
        const options = new chrome.Options();
        options.addArguments('--headless=new');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        options.excludeSwitches(['enable-automation']);
        options.addArguments('--disable-extensions');

        this.driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // Remove webdriver flag
        await this.driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");

        console.log('✓ ChromeDriver initialized');
        await this.sleep(2000);
    }

    /**
     * Navigate to calculator and select Salary
     */
    async navigateToCalculator() {
        console.log('🔗 Navigating to CRA Salary Calculator...');

        await this.driver.get(this.baseUrl);
        await this.driver.wait(until.urlContains('entry'), 10000);
        console.log('  ✓ URL loaded');

        await this.sleep(3000);
        console.log('  ✓ Page ready');

        // Wait for Salary option to be available
        await this.driver.wait(async () => {
            const script = `
                const elements = Array.from(document.querySelectorAll('a, button, div'));
                return elements.some(el => el.textContent.trim().includes('Salary'));
            `;
            return await this.driver.executeScript(script);
        }, 15000);
        console.log('  ✓ Content loaded');

        // Click Salary option
        const clicked = await this.driver.executeScript(`
            const elements = Array.from(document.querySelectorAll('a, button, div, span'));
            const salaryEl = elements.find(el => el.textContent.trim().includes('Salary'));
            if (salaryEl) { salaryEl.click(); return true; }
            return false;
        `);

        if (!clicked) {
            throw new Error('Could not find Salary option');
        }
        console.log('  ✓ Selected Salary');

        // Click Next
        await this.sleep(2000);
        const nextButton = await this.driver.wait(
            until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
            10000
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
        await this.sleep(1000);
        await nextButton.click();
        console.log('  ✓ Clicked Next');

        // Check for server errors and retry if needed
        await this.sleep(3000);
        const pageSource = await this.driver.getPageSource();
        if (pageSource.includes('server-side application error')) {
            console.log('  ⚠️  Server error detected, retrying...');
            await this.sleep(2000);
            await this.driver.executeScript(`
                const elements = Array.from(document.querySelectorAll('a, button, div, span'));
                const salaryEl = elements.find(el => el.textContent.trim().includes('Salary'));
                if (salaryEl) salaryEl.click();
            `);
            await this.sleep(2000);
            const nextBtn2 = await this.driver.findElement(By.xpath("//button[contains(text(), 'Next')]"));
            await this.driver.executeScript("arguments[0].click();", nextBtn2);
            console.log('  ✓ Retried Next');
            await this.sleep(3000);
        }

        await this.driver.wait(until.urlContains('step1'), 15000);
        console.log('✓ Step 1 ready\n');
    }

    /**
     * Fill employee information (Step 1)
     */
    async fillEmployeeInfo(province, paymentDate) {
        console.log('📝 Step 1: Filling employee information...');

        await this.driver.wait(until.elementLocated(By.css('select')), 10000);
        const allSelects = await this.driver.findElements(By.css('select'));
        console.log(`  Found ${allSelects.length} select dropdowns`);

        // Set Province
        console.log(`  Setting province to: ${province}`);
        for (const selectElem of allSelects) {
            try {
                const options = await selectElem.findElements(By.css('option'));
                const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));

                if (optionValues.includes(province)) {
                    await this.driver.executeScript(
                        `arguments[0].value = '${province}'; arguments[0].dispatchEvent(new Event('change'));`,
                        selectElem
                    );
                    console.log(`  ✓ Province set`);
                    await this.sleep(1000);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // Set Pay Period Frequency
        console.log('  Setting pay period frequency...');
        for (const selectElem of allSelects) {
            try {
                const options = await selectElem.findElements(By.css('option'));
                const optionValues = await Promise.all(options.map(opt => opt.getAttribute('value')));

                if (optionValues.includes('MONTHLY_12PP')) {
                    await this.driver.executeScript(
                        "arguments[0].value = 'MONTHLY_12PP'; arguments[0].dispatchEvent(new Event('change'));",
                        selectElem
                    );
                    console.log('  ✓ Pay period set');
                    await this.sleep(1000);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        // Set Payment Date - Year
        console.log('  Setting payment date...');
        const yearSelect = await this.driver.findElement(By.id('datePaidYear'));
        await yearSelect.sendKeys(paymentDate.year);
        await this.sleep(500);

        // Set Payment Date - Month
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
            } catch (e) {
                continue;
            }
        }

        // Set Payment Date - Day
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
            } catch (e) {
                continue;
            }
        }

        console.log(`  ✓ Payment date: ${paymentDate.year}-${paymentDate.month}-${paymentDate.day}`);

        // Click Next
        await this.sleep(2000);
        const nextButton = await this.driver.wait(
            until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
            20000
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
        await this.sleep(500);
        await nextButton.click();
        console.log('  ✓ Clicked Next');

        await this.driver.wait(until.urlContains('step2'), 10000);
        console.log('✓ Step 1 completed\n');
    }

    /**
     * Fill salary information (Step 2)
     */
    async fillSalaryInfo(grossSalary) {
        console.log('📝 Step 2: Filling salary information...');

        const formattedSalary = grossSalary.toFixed(2);
        console.log(`  Entering gross salary: CA$${parseFloat(formattedSalary).toLocaleString('en-CA')}`);

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
                    console.log('  ✓ Salary entered');
                    salaryEntered = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!salaryEntered) {
            await inputs[0].clear();
            await inputs[0].sendKeys(formattedSalary);
            console.log('  ✓ Salary entered');
        }

        await this.sleep(1000);

        // Select "No bonus or retroactive payment"
        const radioButtons = await this.driver.findElements(By.css('input[type="radio"]'));
        for (const radio of radioButtons) {
            try {
                const value = await radio.getAttribute('value');
                const id = await radio.getAttribute('id');

                if (value === 'false' || (id && id.includes('false'))) {
                    await this.driver.executeScript("arguments[0].click();", radio);
                    console.log('  ✓ Selected no bonus');
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        await this.sleep(1000);

        // Click Next
        const nextButton = await this.driver.wait(
            until.elementLocated(By.xpath("//button[contains(text(), 'Next')]")),
            10000
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", nextButton);
        await this.sleep(500);
        await nextButton.click();
        console.log('  ✓ Clicked Next');

        await this.driver.wait(until.urlContains('step3'), 10000);
        console.log('✓ Step 2 completed\n');
    }

    /**
     * Process additional info and calculate (Step 3)
     */
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
                    console.log('  ✓ Clicked Calculate');
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        await this.driver.wait(until.urlContains('results'), 15000);
        console.log('✓ Step 3 completed\n');
    }

    /**
     * Extract results from results page (Step 4)
     * Uses same logic as Python version
     */
    async extractResults(grossSalary, province, paymentDate) {
        console.log('📝 Step 4: Extracting results...');

        const currentUrl = await this.driver.getCurrentUrl();
        console.log(`  Current URL: ${currentUrl}`);

        // Wait for results to calculate
        console.log('  Waiting for results to calculate...');
        await this.sleep(4000);

        // Extract data using JavaScript (matching Python's BeautifulSoup logic)
        const allData = await this.driver.executeScript(`
            const results = {
                employee_info: {},
                income: {},
                tax_deductions: {},
                other_deductions: {},
                totals: {}
            };

            // Extract employee info from definition lists (dt/dd pairs)
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

            // Extract financial data from table rows
            const trs = document.querySelectorAll('tr');
            trs.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 2) {
                    const label = tds[0].textContent.trim();

                    // Find first non-empty value from all columns (not just column 2)
                    let value = null;
                    for (let i = 1; i < tds.length; i++) {
                        const text = tds[i].textContent.trim();
                        if (text && text !== '') {
                            value = text;
                            break;
                        }
                    }

                    if (!value) return;

                    // Categorize the data (matching Python logic exactly)
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

        // Add input parameters
        allData.input = {
            gross_salary: grossSalary,
            province: province,
            payment_date: paymentDate,
            calculation_timestamp: new Date().toISOString()
        };

        console.log('✓ Results extracted\n');
        return allData;
    }

    /**
     * Main scraping method
     */
    async scrape(grossSalary, province, paymentDate) {
        try {
            await this.initDriver();
            await this.navigateToCalculator();
            await this.fillEmployeeInfo(province, paymentDate);
            await this.fillSalaryInfo(grossSalary);
            await this.processAdditionalInfo();
            const results = await this.extractResults(grossSalary, province, paymentDate);
            return results;
        } catch (error) {
            // Save screenshot on error
            if (this.driver) {
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                    const screenshot = await this.driver.takeScreenshot();
                    const screenshotPath = `error_${timestamp}.png`;
                    fs.writeFileSync(screenshotPath, screenshot, 'base64');
                    console.log(`  Screenshot saved: ${screenshotPath}`);
                } catch (e) {
                    // Ignore screenshot errors
                }
            }
            throw error;
        } finally {
            if (this.driver) {
                await this.driver.quit();
            }
        }
    }
}

// ============================================================
// Express API
// ============================================================

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/**
 * POST /api/calculate
 * Calculate payroll deductions
 */
app.post('/api/calculate', async (req, res) => {
    try {
        const { grossSalary, province, year, month, day } = req.body;

        // Validate gross salary
        if (!grossSalary || isNaN(grossSalary) || grossSalary <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid gross salary. Must be a positive number.'
            });
        }

        // Default values
        const currentDate = new Date();
        const paymentDate = {
            year: year || currentDate.getFullYear().toString(),
            month: month || String(currentDate.getMonth() + 1).padStart(2, '0'),
            day: day || String(currentDate.getDate()).padStart(2, '0')
        };

        const selectedProvince = province || 'ONTARIO';

        // Validate province
        const validProvinceCodes = PROVINCES.map(p => p.code);
        if (!validProvinceCodes.includes(selectedProvince)) {
            return res.status(400).json({
                success: false,
                error: `Invalid province. Must be one of: ${validProvinceCodes.join(', ')}`
            });
        }

        // Validate date
        const yearNum = parseInt(paymentDate.year);
        const monthNum = parseInt(paymentDate.month);
        const dayNum = parseInt(paymentDate.day);

        if (yearNum < 2022 || yearNum > 2025) {
            return res.status(400).json({
                success: false,
                error: 'Invalid year. Must be between 2022 and 2025.'
            });
        }

        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                success: false,
                error: 'Invalid month. Must be between 1 and 12.'
            });
        }

        if (dayNum < 1 || dayNum > 31) {
            return res.status(400).json({
                success: false,
                error: 'Invalid day. Must be between 1 and 31.'
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('   NEW CALCULATION REQUEST');
        console.log('='.repeat(60));
        console.log(`📊 Gross Salary: CA$${parseFloat(grossSalary).toLocaleString('en-CA')}`);
        console.log(`🗺️  Province: ${selectedProvince}`);
        console.log(`📅 Payment Date: ${paymentDate.year}-${paymentDate.month}-${paymentDate.day}`);
        console.log('='.repeat(60) + '\n');

        // Run scraper
        const scraper = new CRAPayrollScraper();
        const results = await scraper.scrape(
            parseFloat(grossSalary),
            selectedProvince,
            paymentDate
        );

        console.log('\n' + '='.repeat(60));
        console.log('   CALCULATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`💰 Net Amount: ${results.totals.net_amount || 'N/A'}`);
        console.log(`💸 Total Deductions: ${results.totals.total_deductions || 'N/A'}`);
        console.log('='.repeat(60) + '\n');

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate payroll deductions',
            message: error.message
        });
    }
});

/**
 * GET /api/provinces
 * Get supported provinces
 */
app.get('/api/provinces', (req, res) => {
    res.json({
        success: true,
        data: PROVINCES
    });
});

/**
 * GET /api/health
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        service: 'CRA Payroll Calculator Scraper',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /
 * Root endpoint with documentation
 */
app.get('/', (req, res) => {
    res.json({
        service: 'CRA Payroll Calculator Scraper',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            calculate: 'POST /api/calculate',
            provinces: 'GET /api/provinces',
            health: 'GET /api/health'
        },
        example: {
            endpoint: 'POST /api/calculate',
            body: {
                grossSalary: 5072.77,
                province: 'ONTARIO',
                year: '2025',
                month: '11',
                day: '20'
            }
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('   CRA PAYROLL CALCULATOR SCRAPER - MONOLITH');
    console.log('='.repeat(60));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}`);
    console.log('='.repeat(60) + '\n');
    console.log('Available endpoints:');
    console.log(`  POST   http://localhost:${PORT}/api/calculate`);
    console.log(`  GET    http://localhost:${PORT}/api/provinces`);
    console.log(`  GET    http://localhost:${PORT}/api/health`);
    console.log('\n' + '='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n📴 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n📴 Shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
