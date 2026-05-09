devpost: https://devpost.com/software/label-lynx

## ✨ Inspiration
We were inspired by the growing gap between global food standards and everyday shopping. While many ingredients banned in Europe or Asia are still common in US products, the average consumer doesn't have the time to research ingredient names while standing in a grocery aisle. We wanted to make an app that would easily provide an overview of risky ingredients and find alternatives available in your grocery store.

## 🤖 What it does
Label Lynx uses **Gemini 2.5 Flash** to parse the ingredients in the uploaded image, then it checks if there are any risky ingredients in the product by comparing with the US, EU, and Asian food standard databases as well as querying Gemini for more information on why the ingredient is risky. After analyzing the results, the app displays the ingredients in order of highest to lowest risk levels, provides an overall rating out of 100, and displays alternatives in your chosen grocery store.

## 🛠️ How we built it
- **Frontend:** React + Vite
- **Backend:** Firebase (Firestore & Auth) to handle user accounts and previous scans.
- **AI Engine:** Gemini 2.5 to parse ingredients in the uploaded label, provide alternatives in the selected grocery store.
- **Styling:** Tailwind CSS

## 👾 Challenges we ran into
There were a few significant challenges we ran into throughout the development of this project. The most significant one was web scraping. The original plan for this project was to scrape grocery store websites to find similar but healthier alternatives; however, this proved to be very tricky because we faced a lot of issues with overcoming the protection layers that popular grocery websites have and integrating multiple stores seemed like it would consume a lot of our hacking time. After some research, we decided that Gemini is pretty good at giving alternatives available in the specific store selected, so we switched to having Gemini find the alternatives. Another significant challenge we faced was the Gemini API rate-limit. Gemini API has a rate-limit of 20 requests per day, which we quickly burned through while testing features.

## 🎉 Accomplishments that we're proud of
- **Scanning labels and providing real-time feedback:** We are very proud to have a website that can scan the labels and provide accurate analysis on the ingredients.
- **Alternatives:** The website provides alternatives for products, making it not only informative, but also useful in the moment.
- **Intuitive UI:** Created a user friendly camera interface, gallery, and login/signup.
- Using Generative AI to help with code planning, speeding up development, and learning about new software.

## 📝 What we learned
- Maggie learned about what API credits, quotas, and rate-limits are :D
- We learned more about web scraping and the difficulties of overcoming the firewalls on some websites.
- We learned that food safety regulations/standards can vary significantly between different regions of the world.
- We learned how to use AI coding tools to aid in the development of projects.

## 👀 What's next for Label Lynx
- Adding analysis of nutrient content
- Expanding to more grocery store options
- Including more global grocery store chains
- Improving UI
