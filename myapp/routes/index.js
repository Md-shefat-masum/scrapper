var express = require('express');
var router = express.Router();

const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const { env } = require('process');
require('dotenv').config();

function delay() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve('ok')
        }, 5);
    })
}

function create_path(folder_directory) {
    const fs = require('fs');

    let directoryPath = 'products/' + folder_directory;
    directoryPath = directoryPath.replace(/\/{2,}/g, '/');
    if (directoryPath.startsWith('/')) {
        path = directoryPath.substring(1);
    }
    if (directoryPath.endsWith('/')) {
        path = directoryPath.slice(0, -1);
    }
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
        console.log(`Directory '${directoryPath}' created.`);
    }

    return directoryPath;
}

function update_link(url) {
    const path = require('path');
    const fs = require('fs');
    const DATA_FILE = path.join(__dirname, '../', 'public/javascripts/startech_links.json');
    let data = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(data);

    let link = data.find(i => i.url == url);
    link.scrapped = 1;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const srap = async (category_url) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // var progressBar = new cliProgress.MultiBar({
    //     format: 'CLI Progress |' + colors.cyan('{bar}') + '| {percentage}% || ETA: {duration}s || {item_no}/{item_total} items || Title: {title}',
    //     barCompleteChar: '\u2588',
    //     barIncompleteChar: '\u2591',
    // }, cliProgress.Presets.shades_classic);

    var progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_grey);

    var progress_count = 1;

    /******/

    // let category_url = env.category_url;
    // let folder_name = env.folder_name;

    /******/

    try {
        await page.goto(category_url);
        let total_page = await page.evaluate(() => {
            let breadcrumb = document.querySelectorAll('.breadcrumb li');
            breadcrumb = [...breadcrumb];
            breadcrumb.shift();
            let directoryPath = breadcrumb.map(i => i.innerText).join('/');


            let el = document.querySelector('.bottom-bar .text-right p');
            if (el) {
                function extractPageNumber(text) {
                    const regex = /\((\d+) Pages\)/;
                    const match = text.match(regex);
                    if (match && match[1]) {
                        return parseInt(match[1], 10);
                    }
                    return null;
                }
                let total_page = extractPageNumber(el.innerText);
                return { total_page, directoryPath };
            }
            return 1;
        });

        let folder_name = create_path(total_page.directoryPath);
        total_page = total_page.total_page;

        let urls = [];
        let page_url = new URL(category_url);
        for (let index = 0; index < total_page; index++) {
            page_url.searchParams.set('page', index + 1);
            urls.push(page_url.href);
        }

        let product_items = [];

        for (let i = 0; i < urls.length; i++) {
            const selector = 'div.p-item';
            let page = await browser.newPage();
            await page.goto(urls[i]);
            const category_product_items = await page.evaluate((sel) => {
                const elements = document.querySelectorAll(sel);
                return Array.from(elements).map(element => {
                    let image = element.querySelector('.p-item-img img');
                    let title = element.querySelector('.p-item-name a');

                    let short_description = element.querySelectorAll('.short-description ul li');
                    short_description = [...short_description].map(item => item.innerText);

                    let price_single = element.querySelector('.p-item-price span');
                    if (price_single) {
                        price_single = price_single.innerText.replace(/[^\d]/g, '');
                        price_single = parseFloat(price_single);
                    } else {
                        price_single = 0;
                    }

                    let price_new = element.querySelector('.price-new');
                    if (price_new) {
                        price_new = price_new.innerText.replace(/[^\d]/g, '');
                        price_new = parseFloat(price_new);
                    } else {
                        price_new = 0;
                    }

                    let category_description = element.querySelector('.category-description');
                    if (category_description) {
                        category_description = category_description.innerHTML;
                    }

                    let category_intro_h1 = element.querySelector('.c-intro h1');
                    if (category_intro_h1) {
                        category_intro_h1 = category_intro_h1.innerHTML;
                    }

                    let category_intro_p = element.querySelector('.c-intro p');
                    if (category_intro_p) {
                        category_intro_p = category_intro_p.innerHTML;
                    }

                    let category_intro_child_list = element.querySelectorAll('.c-intro .child-list a');
                    category_intro_child_list = [...category_intro_child_list].map(item => item.innerText);

                    let price_old = element.querySelector('.price-old');
                    if (price_old) {
                        price_old = price_old.innerText.replace(/[^\d]/g, '');
                        price_old = parseFloat(price_old);
                    } else {
                        price_old = 0;
                    }

                    let cat_seo_title = document.querySelector('title') || '';
                    if (cat_seo_title) cat_seo_title = cat_seo_title.innerText;

                    let cat_seo_description = document.querySelector('meta[name="description"]') || '';
                    if (cat_seo_description) cat_seo_description = cat_seo_description.content;

                    let cat_seo_keywords = document.querySelector('meta[name="keywords"]') || '';
                    if (cat_seo_keywords) cat_seo_keywords = cat_seo_keywords.content;

                    return {
                        url: title.href,
                        img: image.src,
                        title: title.innerText,
                        product_list_short_description: short_description,
                        price_new,
                        price_old,
                        price_single,

                        category_description,
                        category_intro_h1,
                        category_intro_p,
                        category_intro_child_list,

                        cat_seo_title,
                        cat_seo_description,
                        cat_seo_keywords,
                    }
                });
            }, selector);

            product_items = [...product_items, ...category_product_items];
        }

        let full_products = [];

        progressBar.start(product_items.length, 0);
        for (let item of product_items) {
            // let progress = progressBar.create(100, 0, { title: item.title, item_no: progress_count++, item_total: product_items.length })

            progressBar.update(progress_count++, { title: item.title });

            const page = await browser.newPage();
            await page.goto(item.url);

            const details = await page.evaluate(({ sel }) => {
                let element = document.querySelector(sel);
                if (!element) return {};

                let status = element.querySelector('.product-info-data.product-status')?.innerText;
                let code = element.querySelector('.product-info-data.product-code')?.innerText;
                let brand = element.querySelector('.product-info-data.product-brand')?.innerText;

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

                let product_seo_title = document.querySelector('title') || '';
                if (product_seo_title) product_seo_title = product_seo_title.innerText;

                let product_seo_description = document.querySelector('meta[name="description"]') || '';
                if (product_seo_description) product_seo_description = product_seo_description.content;

                let product_seo_keywords = document.querySelector('meta[name="keywords"]') || '';
                if (product_seo_keywords) product_seo_keywords = product_seo_keywords.content;

                return {
                    status: status,
                    code: code,
                    brand,

                    product_page_short_description: short_description,
                    emi_price: emi_price,

                    full_description,
                    specifications,
                    latest_price,
                    images,

                    product_seo_title,
                    product_seo_description,
                    product_seo_keywords,
                };
            }, { sel: '.product-details.content' });

            let final_item = {
                ...item,
                ...details
            };

            full_products.push(final_item);
        }

        progressBar.stop();

        let url = new URL(category_url);
        let filePath = (url.pathname + url.search).replaceAll('/', '_').replaceAll('?', '_');
        const fs = require('fs');
        fs.writeFile(`${folder_name}/` + filePath + '.json', JSON.stringify(full_products), 'utf8', (err) => {
            if (err) {
                console.error('Error writing to file', err);
            } else {
                console.log('Successfully wrote to file');
            }
        });
        // console.log(full_products);

        update_link(category_url);

        await browser.close();
    } catch (error) {
        await browser.close();
    }

    // process.exit(0);
};

const category_srap = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto("https://www.startech.com.bd");
    const nav_links = await page.evaluate(() => {
        let el = document.querySelectorAll('.navbar-nav a')
        return [...el].map(e => ({
            url: e.href,
            scrapped: 0,
        }));
    });

    await browser.close();

    return nav_links;
};


/* GET home page. */
router.get('/', function (req, res, next) {
    res.render('index', { title: 'Express' });
});
router.get('/source', function (req, res, next) {
    res.render('source', { title: 'Express' });
});
router.post('/source', async function (req, res, next) {
    console.log('\n', req.body, '\n');

    await srap(req.body.category_url);

    console.log('\n');
    res.json('done');
});

router.get('/links', async function (req, res, next) {
    res.render('startech_links');
});

// router.get('/get-links', async function (req, res, next) {
//     let links = await category_srap();
//     res.json(links);
// });

module.exports = router;
