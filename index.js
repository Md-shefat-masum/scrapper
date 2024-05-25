const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const { env } = require('process');
require('dotenv').config();

function delay() {
    return new Promise((resolve)=>{
        setTimeout(() => {
            resolve('ok')
        }, 5);
    })
}

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    var progressBar = new cliProgress.MultiBar({
        format: 'CLI Progress |' + colors.cyan('{bar}') + '| {percentage}% || ETA: {duration}s || {item_no}/{item_total} items || Title: {title}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);

    var progress_count = 0;

    /******/

    let category_url = env.category_url;
    let folder_name = env.folder_name;

    /******/

    await page.goto(category_url);

    const selector = 'div.p-item';
    const product_items = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map(element => {
            let image = element.querySelector('.p-item-img img');
            let title = element.querySelector('.p-item-name a');

            let short_description = element.querySelectorAll('.short-description ul li');
            short_description = [...short_description].map(item => item.innerText);

            let price_new = element.querySelector('.price-new');
            if (price_new) {
                price_new = price_new.innerText.replace(/[^\d]/g, '');
                price_new = parseFloat(price_new);
            } else {
                price_new = 0;
            }

            let price_old = element.querySelector('.price-old');
            if (price_old) {
                price_old = price_old.innerText.replace(/[^\d]/g, '');
                price_old = parseFloat(price_old);
            } else {
                price_old = 0;
            }

            return {
                url: title.href,
                img: image.src,
                title: title.innerText,
                product_list_short_description: short_description,
                price_new,
                price_old,
            }
        });
    }, selector);


    let full_products = [];

    // progressBar.start(product_items.length, 0);
    for (let item of product_items) {
        let progress = progressBar.create(100, 0, {title: item.title, item_no: progress_count++, item_total: product_items.length})

        progress.update(5);
        const page = await browser.newPage();
        await page.goto(item.url);
        progress.update(15);

        const details = await page.evaluate(({sel}) => {
            let element = document.querySelector(sel);
            let status = element.querySelector('.product-info-data.product-status')?.innerText;
            let code = element.querySelector('.product-info-data.product-code')?.innerText;

            let short_description = element.querySelectorAll('.short-description ul li');
            short_description = [...short_description].map((item) => item.innerText);
            short_description.pop();

            let emi_price = element.querySelector('.emi .price')?.innerText;
            if (emi_price) {
                emi_price = emi_price.replace(/[^\d]/g, '');
                emi_price = parseFloat(emi_price);
            } else {
                emi_price = 0;
            }

            let full_description = element.querySelector('.full-description')?.innerHTML;

            let specifications = element.querySelectorAll('#specification thead');
            specifications = Array.from(specifications).map(thead => {
                let trs = thead.nextElementSibling.querySelectorAll('tr');
                let row_values = Array.from(trs).map(tr => {
                    let [key, value] = tr.innerText.split('\n');
                    return {
                        key,
                        value
                    };
                });

                let heading = thead.innerText;
                return {
                    heading,
                    values: row_values,
                }
            });

            let latest_price = {};
            let latest_price_el = element.querySelector('#latest-price');
            if (latest_price_el) {
                latest_price.heading = latest_price_el.querySelector('.section-head').innerText;
                latest_price.paragraph = latest_price_el.querySelector('p').innerText;
            }

            let images = element.querySelectorAll('.thumbnail');
            images = Array.from(images).map(el => el.href);

            return {
                status: status,
                code: code,
                product_page_short_description: short_description,
                emi_price: emi_price,
                full_description,
                specifications,
                latest_price,
                images,
            };
        }, {sel: '.product-details.content'});

        let final_item = {
            ...item,
            ...details
        };

        for (let i = 10; i <= 100; i+=10) {
            await delay();
            progress.update(i);
        }
        progress.stop();

        full_products.push(final_item);
    }

    let url = new URL(category_url);
    let filePath = (url.pathname + url.search).replaceAll('/', '_').replaceAll('?', '_');
    const fs = require('fs');
    fs.writeFile(`products/${folder_name}/` + filePath + '.json', JSON.stringify(full_products), 'utf8', (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log('Successfully wrote to file');
        }
    });
    // console.log(full_products);

    await browser.close();
    process.exit(1);
})();
