# -*- coding: utf-8 -*-
import json
import time
import sys
import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

class CRASalaryCalculatorScraper:
    def __init__(self, headless=False, debug=False):
        """Initialize the scraper with headless mode option"""
        self.debug = debug
        chrome_options = Options()

        if headless:
            chrome_options.add_argument("--headless=new")

        # Stability and compatibility options
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--disable-software-rasterizer")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-logging")
        chrome_options.add_argument("--log-level=3")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")

        # Add user agent to avoid detection
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        # Suppress unnecessary warnings
        chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)

        try:
            self.driver = webdriver.Chrome(options=chrome_options)
            # Give Chrome a moment to fully initialize
            time.sleep(2)

            self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            print("✓ ChromeDriver initialized successfully")
        except Exception as e:
            print(f"❌ Failed to initialize ChromeDriver: {str(e)}")
            print("\nPossible solutions:")
            print("1. Update ChromeDriver: pip install --upgrade selenium")
            print("2. Ensure Chrome browser is installed")
            print("3. Check that ChromeDriver version matches your Chrome version")
            raise

        self.base_url = "https://apps.cra-arc.gc.ca/ebci/rhpd/beta/entry"
        self.results = {}
    
    def navigate_to_start(self):
        """Navigate to the salary calculator"""
        print("🔗 Navigating to CRA Salary Calculator...")
        try:
            self.driver.get(self.base_url)
            print("  ✓ URL loaded")

            # Wait for the page to be ready
            WebDriverWait(self.driver, 30).until(
                lambda driver: driver.execute_script("return document.readyState") == "complete"
            )
            print("  ✓ Page ready")
            time.sleep(3)  # Extra wait for JavaScript to render

            # We should be on the entry page
            print(f"  Current URL: {self.driver.current_url}")

            if self.debug:
                print("  [DEBUG] Saving page source...")
                with open("page_source_entry.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print("  [DEBUG] Page source saved to page_source_entry.html")

            # Try multiple strategies to find and click the Salary button
            print("  ℹ️  Selecting 'Salary' calculation type...")
            salary_clicked = False

            # Strategy 1: Try finding by button with text "Salary"
            try:
                salary_button = WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Salary')]"))
                )
                self.driver.execute_script("arguments[0].scrollIntoView(true);", salary_button)
                time.sleep(0.5)
                salary_button.click()
                salary_clicked = True
                print("  ✓ Selected 'Salary' (Strategy 1: button text)")
            except:
                pass

            # Strategy 2: Try finding by any element containing "Salary"
            if not salary_clicked:
                try:
                    salary_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Salary')]")
                    for elem in salary_elements:
                        if elem.is_displayed() and elem.is_enabled():
                            # Try to find clickable parent
                            parent = elem.find_element(By.XPATH, "./ancestor::button | ./ancestor::a | ./ancestor::div[@role='button']")
                            self.driver.execute_script("arguments[0].scrollIntoView(true);", parent)
                            time.sleep(0.5)
                            parent.click()
                            salary_clicked = True
                            print("  ✓ Selected 'Salary' (Strategy 2: parent element)")
                            break
                except:
                    pass

            # Strategy 3: Try JavaScript click
            if not salary_clicked:
                try:
                    salary_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Salary')]")
                    for elem in salary_elements:
                        if elem.is_displayed():
                            self.driver.execute_script("arguments[0].click();", elem)
                            salary_clicked = True
                            print("  ✓ Selected 'Salary' (Strategy 3: JavaScript click)")
                            break
                except:
                    pass

            if not salary_clicked:
                raise Exception("Could not find or click the Salary button")

            time.sleep(2)

            # Click the Next button
            next_button = WebDriverWait(self.driver, 20).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Next')]"))
            )
            self.driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
            time.sleep(0.5)
            next_button.click()
            print("  ✓ Clicked 'Next' button")

            # Wait for page transition
            time.sleep(5)

            # Wait for the page to be fully loaded
            WebDriverWait(self.driver, 30).until(
                lambda driver: driver.execute_script("return document.readyState") == "complete"
            )

            print("✓ Navigation completed - Ready for Step 1")

        except Exception as e:
            print(f"❌ Navigation failed: {str(e)}")
            print(f"Current URL: {self.driver.current_url}")
            # Take a screenshot for debugging
            try:
                screenshot_path = f"error_screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  Screenshot saved to: {screenshot_path}")

                # Save page source for debugging
                with open(f"error_page_source_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print(f"  Page source saved for debugging")
            except Exception as debug_error:
                print(f"  Could not save debug info: {debug_error}")
            raise
    
    def fill_employee_info(self, province, payment_date):
        """Fill Step 1: Employee Information"""
        print("📝 Step 1: Filling employee information...")

        try:
            # Wait for page to be fully loaded
            time.sleep(3)

            # Find all select elements on the page
            all_selects = self.driver.find_elements(By.TAG_NAME, "select")
            print(f"  Found {len(all_selects)} select dropdowns")

            # Set Province - find select with ONTARIO option
            print(f"  Setting province to: {province}")
            for select_elem in all_selects:
                try:
                    select_obj = Select(select_elem)
                    options = [opt.get_attribute("value") for opt in select_obj.options]
                    if province in options:
                        select_obj.select_by_value(province)
                        print(f"  ✓ Province set to: {province}")
                        time.sleep(1)
                        break
                except:
                    continue

            # Set Pay Period Frequency - find select with MONTHLY_12PP option
            print(f"  Setting pay period frequency...")
            for select_elem in all_selects:
                try:
                    select_obj = Select(select_elem)
                    options = [opt.get_attribute("value") for opt in select_obj.options]
                    if "MONTHLY_12PP" in options:
                        select_obj.select_by_value("MONTHLY_12PP")
                        print(f"  ✓ Pay period: Monthly (12 pay periods a year)")
                        time.sleep(1)
                        break
                except:
                    continue

            # Set Payment Date - Year (has ID: datePaidYear)
            print(f"  Setting payment date...")
            year_select = Select(self.driver.find_element(By.ID, "datePaidYear"))
            year_select.select_by_value(payment_date["year"])
            time.sleep(0.5)

            # Month - find select with month options
            for select_elem in all_selects:
                try:
                    select_obj = Select(select_elem)
                    options = [opt.get_attribute("value") for opt in select_obj.options]
                    if "01" in options and "12" in options and len(options) == 13:  # 12 months + empty
                        select_obj.select_by_value(payment_date["month"])
                        time.sleep(0.5)
                        break
                except:
                    continue

            # Day - find select with day options
            for select_elem in all_selects:
                try:
                    select_obj = Select(select_elem)
                    options = [opt.get_attribute("value") for opt in select_obj.options]
                    if "01" in options and "31" in options and len(options) == 32:  # 31 days + empty
                        select_obj.select_by_value(payment_date["day"])
                        break
                except:
                    continue

            print(f"  ✓ Payment date: {payment_date['year']}-{payment_date['month']}-{payment_date['day']}")

            # Click Next
            time.sleep(2)
            next_button = WebDriverWait(self.driver, 20).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Next')]"))
            )
            self.driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
            time.sleep(0.5)
            next_button.click()
            print("  ✓ Clicked 'Next' button")

            # Wait for Step 2 to load
            time.sleep(3)
            print("✓ Step 1 completed\n")

        except Exception as e:
            print(f"❌ Error in Step 1: {str(e)}")
            print(f"Current URL: {self.driver.current_url}")
            try:
                screenshot_path = f"error_step1_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  Screenshot saved to: {screenshot_path}")

                # Save page source
                with open(f"error_step1_source_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print(f"  Page source saved for debugging")
            except Exception as debug_error:
                print(f"  Could not save debug info: {debug_error}")
            raise
    
    def fill_salary_info(self, gross_salary):
        """Fill Step 2: Salary Information"""
        print("📝 Step 2: Filling salary information...")

        try:
            # Wait for page to be fully loaded
            time.sleep(3)

            # Find the salary input field - it's in an input-group with CA$ prefix
            print(f"  Entering gross salary: CA${gross_salary:,.2f}")

            # Find all text input fields
            all_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='text']")
            salary_field = None

            # The first text input after CA$ is the salary field
            for input_elem in all_inputs:
                try:
                    # Check if parent has CA$ span
                    parent = input_elem.find_element(By.XPATH, "..")
                    if "input-group" in parent.get_attribute("class"):
                        salary_field = input_elem
                        break
                except:
                    continue

            if not salary_field:
                raise Exception("Could not find salary input field")

            # Make sure field is visible and interactable
            self.driver.execute_script("arguments[0].scrollIntoView(true);", salary_field)
            time.sleep(0.5)

            # Enter salary - format with 2 decimal places
            salary_field.click()
            time.sleep(0.3)
            salary_field.clear()
            time.sleep(0.3)
            salary_formatted = f"{gross_salary:.2f}"
            salary_field.send_keys(salary_formatted)
            print(f"  ✓ Gross salary entered: CA${salary_formatted}")

            # Scroll down to find and click "No bonus or retroactive payment" radio button
            time.sleep(1)
            try:
                no_bonus_radio = self.driver.find_element(By.CSS_SELECTOR, "input[value='NO_BONUS_PAY_NO_RETROACTIVE_PAY']")
                self.driver.execute_script("arguments[0].scrollIntoView(true);", no_bonus_radio)
                time.sleep(0.5)
                no_bonus_radio.click()
                print(f"  ✓ Selected 'No bonus or retroactive payment'")
            except:
                print(f"  ⚠ Could not find/click no bonus option")

            # Click Next
            time.sleep(2)
            next_button = WebDriverWait(self.driver, 20).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Next')]"))
            )
            self.driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
            time.sleep(0.5)
            next_button.click()
            print("  ✓ Clicked 'Next' button")

            # Wait for Step 3
            time.sleep(3)
            print("✓ Step 2 completed\n")

        except Exception as e:
            print(f"❌ Error in Step 2: {str(e)}")
            print(f"Current URL: {self.driver.current_url}")
            try:
                screenshot_path = f"error_step2_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  Screenshot saved to: {screenshot_path}")

                # Save page source
                with open(f"error_step2_source_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print(f"  Page source saved for debugging")
            except Exception as debug_error:
                print(f"  Could not save debug info: {debug_error}")
            raise
    
    def skip_additional_info(self):
        """Skip Step 3: Additional Information (TD1 tax credits)"""
        print("📝 Step 3: Processing additional information...")

        try:
            # Wait for page to load
            time.sleep(3)

            # Save page source for debugging
            if self.debug:
                with open("step3_page_source.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print("  [DEBUG] Step 3 page source saved")

            # TD1 form radio should already be selected with default values
            # Find all buttons and print their text
            all_buttons = self.driver.find_elements(By.TAG_NAME, "button")
            print(f"  Found {len(all_buttons)} buttons on page")

            button_to_click = None

            for btn in all_buttons:
                btn_text = btn.text.strip()
                btn_class = btn.get_attribute("class") or ""
                if self.debug:
                    print(f"  [DEBUG] Button: '{btn_text}' | Class: '{btn_class}'")

                # Look for Next or Calculate button
                if btn_text and ("Next" in btn_text or "Calculate" in btn_text or "Calc" in btn_text):
                    button_to_click = btn
                    print(f"  Found button to click: '{btn_text}'")
                    break

            if not button_to_click:
                raise Exception("Could not find Next or Calculate button")

            # Scroll and click
            self.driver.execute_script("arguments[0].scrollIntoView(true);", button_to_click)
            time.sleep(1)
            self.driver.execute_script("arguments[0].click();", button_to_click)
            print(f"  ✓ Clicked button: '{button_to_click.text}'")

            # Wait for next page to load
            time.sleep(4)
            print("✓ Step 3 completed\n")

        except Exception as e:
            print(f"❌ Error in Step 3: {str(e)}")
            print(f"Current URL: {self.driver.current_url}")
            try:
                screenshot_path = f"error_step3_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  Screenshot saved to: {screenshot_path}")

                # Save page source
                with open(f"error_step3_source_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print(f"  Page source saved for debugging")
            except Exception as debug_error:
                print(f"  Could not save debug info: {debug_error}")
            raise
    
    def calculate_and_get_results(self):
        """Extract results from the results page"""
        print("📝 Step 4: Extracting results...")

        try:
            # We should already be on the results page after clicking Calculate in Step 3
            # Wait for page to load
            time.sleep(3)

            print(f"  Current URL: {self.driver.current_url}")

            # Take screenshot of results
            if self.debug:
                screenshot_path = f"results_screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  ✓ Results screenshot saved to: {screenshot_path}")

            # Extract results
            page_source = self.driver.page_source
            results = self._parse_results(page_source)

            # Save results HTML for debugging
            if self.debug:
                with open("results_page_source.html", "w", encoding="utf-8") as f:
                    f.write(page_source)
                print(f"  ✓ Results HTML saved to: results_page_source.html")

            print("✓ Results extracted\n")
            return results

        except Exception as e:
            print(f"❌ Error in Step 4: {str(e)}")
            print(f"Current URL: {self.driver.current_url}")
            try:
                screenshot_path = f"error_step4_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                self.driver.save_screenshot(screenshot_path)
                print(f"  Screenshot saved to: {screenshot_path}")

                # Save page source
                with open(f"error_step4_source_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                print(f"  Page source saved for debugging")
            except Exception as debug_error:
                print(f"  Could not save debug info: {debug_error}")
            raise
    
    def _parse_results(self, page_source):
        """Parse the results page to extract deduction information"""
        soup = BeautifulSoup(page_source, 'html.parser')

        results = {
            "employee_info": {},
            "income": {},
            "tax_deductions": {},
            "other_deductions": {},
            "totals": {}
        }

        # Extract employee info from definition list
        for dt in soup.find_all('dt'):
            label = dt.get_text(strip=True)
            dd = dt.find_next_sibling('dd')
            if dd:
                value = dd.get_text(strip=True)

                if "Province of employment" in label:
                    results["employee_info"]["province"] = value
                elif "Pay period frequency" in label:
                    results["employee_info"]["pay_period_frequency"] = value
                elif "Date the employee is paid" in label:
                    results["employee_info"]["payment_date"] = value
                elif "Federal amount from TD1" in label:
                    results["employee_info"]["federal_td1"] = value
                elif "Provincial amount from TD1" in label:
                    results["employee_info"]["provincial_td1"] = value

        # Extract financial data from table rows
        for tr in soup.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) >= 2:
                label = tds[0].get_text(strip=True)

                # Get non-empty value from any column
                value = None
                for td in tds[1:]:
                    text = td.get_text(strip=True)
                    if text and text != '':
                        value = text

                if not value:
                    continue

                # Categorize the data
                if "Salary or wages income" in label:
                    results["income"]["salary_or_wages"] = value
                elif "Total cash income" in label:
                    results["totals"]["total_cash_income"] = value
                elif "Federal tax deduction" in label:
                    results["tax_deductions"]["federal_tax"] = value
                elif "Provincial tax deduction" in label:
                    results["tax_deductions"]["provincial_tax"] = value
                elif "Total tax deductions" in label:
                    results["tax_deductions"]["total_tax"] = value
                elif "CPP deductions" in label and "CPP2" not in label:
                    results["other_deductions"]["cpp"] = value
                elif "CPP2 deductions" in label:
                    results["other_deductions"]["cpp2"] = value
                elif "EI deductions" in label:
                    results["other_deductions"]["ei"] = value
                elif "Total deductions" in label:
                    results["totals"]["total_deductions"] = value
                elif "Net amount" in label:
                    results["totals"]["net_amount"] = value

        return results
    
    def scrape(self, gross_salary, province, payment_date):
        """
        Main scraping method
        
        Args:
            gross_salary (float): Gross salary per pay period
            province (str): Province of employment
            payment_date (dict): Payment date {"year": "YYYY", "month": "Month", "day": "DD"}
            
        Returns:
            dict: JSON output with calculation results
        """
        try:
            self.navigate_to_start()
            self.fill_employee_info(province, payment_date)
            self.fill_salary_info(gross_salary)
            self.skip_additional_info()
            results = self.calculate_and_get_results()
            
            # Add input parameters to results
            results["input"] = {
                "gross_salary": gross_salary,
                "province": province,
                "payment_date": payment_date,
                "calculation_timestamp": datetime.now().isoformat()
            }
            
            return results
        
        except Exception as e:
            print(f"❌ Scraper failed: {str(e)}")
            raise
        
        finally:
            self.driver.quit()

def get_user_input():
    """Collect user input for gross salary, province, and payment date"""
    print("\n" + "="*60)
    print("   CRA SALARY CALCULATOR SCRAPER")
    print("="*60 + "\n")
    
    # Get gross salary
    while True:
        try:
            gross_salary = float(input("📊 Enter gross salary per pay period (CA$): "))
            if gross_salary <= 0:
                print("❌ Salary must be greater than 0. Try again.")
                continue
            break
        except ValueError:
            print("❌ Invalid input. Please enter a valid number.")
    
    # Get province
    provinces = {
        "1": ("Alberta", "Alberta"),
        "2": ("British Columbia", "British Columbia"),
        "3": ("Manitoba", "Manitoba"),
        "4": ("New Brunswick", "New Brunswick"),
        "5": ("Newfoundland and Labrador", "Newfoundland and Labrador"),
        "6": ("Nova Scotia", "Nova Scotia"),
        "7": ("Ontario", "Ontario"),
        "8": ("Prince Edward Island", "Prince Edward Island"),
        "9": ("Quebec", "Quebec"),
        "10": ("Saskatchewan", "Saskatchewan"),
        "11": ("Northwest Territories", "Northwest Territories"),
        "12": ("Nunavut", "Nunavut"),
        "13": ("Yukon", "Yukon"),
    }
    
    print("\n🗺️  Select province or territory:")
    for key, (display, value) in provinces.items():
        print(f"  {key}. {display}")
    
    while True:
        choice = input("\nEnter choice (1-13): ")
        if choice in provinces:
            province = provinces[choice]
            print(f"✓ Province: {province}")
            break
        print("❌ Invalid choice. Please enter a number between 1-13.")
    
    # Get payment date
    print("\n📅 Enter the date employee is paid:")
    
    # Year
    while True:
        year = input("  Year (2022-2025): ")
        if year in ["2022", "2023", "2024", "2025"]:
            break
        print("  ❌ Please enter a year between 2022-2025.")
    
    # Month
    months = {
        "1": "January", "2": "February", "3": "March", "4": "April",
        "5": "May", "6": "June", "7": "July", "8": "August",
        "9": "September", "10": "October", "11": "November", "12": "December"
    }
    
    print("  Months: 1=Jan, 2=Feb, 3=Mar, 4=Apr, 5=May, 6=Jun,")
    print("           7=Jul, 8=Aug, 9=Sep, 10=Oct, 11=Nov, 12=Dec")
    
    while True:
        month_choice = input("  Month (1-12): ")
        if month_choice in months:
            month = months[month_choice]
            break
        print("  ❌ Please enter a number between 1-12.")
    
    # Day
    while True:
        try:
            day = int(input("  Day (1-31): "))
            if 1 <= day <= 31:
                day_str = f"{day:02d}"
                break
            print("  ❌ Please enter a day between 1-31.")
        except ValueError:
            print("  ❌ Invalid input. Please enter a valid day number.")
    
    payment_date = {
        "year": year,
        "month": month,
        "day": day_str
    }
    
    return gross_salary, province, payment_date

def main():
    """Main function"""
    try:
        # Check if command line arguments are provided
        use_cli_args = any(arg.startswith('--') for arg in sys.argv[1:] if arg not in ['--debug', '-d'])
        debug_mode = "--debug" in sys.argv or "-d" in sys.argv

        if use_cli_args:
            # Parse command line arguments
            import argparse
            parser = argparse.ArgumentParser(description='CRA Salary Tax Calculator')
            parser.add_argument('--gross', type=float, required=True, help='Gross salary amount')
            parser.add_argument('--province', type=str, required=True, help='Province or territory')
            parser.add_argument('--year', type=str, required=True, help='Payment year (YYYY)')
            parser.add_argument('--month', type=str, required=True, help='Payment month (MM)')
            parser.add_argument('--day', type=str, required=True, help='Payment day (DD)')
            parser.add_argument('--debug', '-d', action='store_true', help='Enable debug mode')

            args = parser.parse_args()

            gross_salary = args.gross
            province = args.province
            payment_date = {
                "year": args.year,
                "month": args.month,
                "day": args.day
            }

            if not debug_mode:
                # Suppress output when called from API
                sys.stdout = open(os.devnull, 'w')
                sys.stderr = open(os.devnull, 'w')
        else:
            # Interactive mode - get user input
            gross_salary, province, payment_date = get_user_input()

        # Run scraper (always headless when called from API)
        scraper = CRASalaryCalculatorScraper(headless=True, debug=False)
        results = scraper.scrape(gross_salary, province, payment_date)

        # Restore stdout/stderr if suppressed
        if use_cli_args and not debug_mode:
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__

        # Output results as JSON (for API consumption)
        json_output = json.dumps(results, indent=2)
        print(json_output)

        # Only save to file in interactive mode
        if not use_cli_args:
            filename = f"cra_salary_calculation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(filename, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n✓ Results saved to: {filename}\n", file=sys.stderr)

    except KeyboardInterrupt:
        print("\n\n⚠️  Scraping cancelled by user.", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Fatal error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()