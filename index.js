import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import session from 'express-session';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { google } from 'googleapis';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const port = 3000;

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

db.connect()
    .then(() => console.log("Connected to database"))
    .catch((err) => console.error("Database connection error:", err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.use('/profil', express.static('profil'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//profile image upload
const createDirectories = () => {
    const directories = ['profil'];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    });
};
createDirectories();


// Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));

// Multer
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'profil/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadProfile = multer({ storage: profileStorage });
const defaultImage = 'defaultprofil.jpeg';

app.get('/', (req, res) => {
    res.render('index.ejs');
});

app.get('/login-register', (req, res) => {
    res.render('login-register.ejs' , { message: '' });
});

app.get('/home', (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }
    res.render('home.ejs', { user });
});

//profile
app.get('/profile',  async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }
    try{
        const usersavedpost  =  await db.query('SELECT * FROM saverecipe WHERE user_id =$1', [user.id]);
        const savedposts = usersavedpost.rows; 

        const profil   = await db.query('SELECT * FROM profile WHERE id = $1', [user.id]);
        const profilimg = profil.rows[0].profilimg;
        const username = profil.rows[0].username;
        const name = profil.rows[0].name;
        const surname = profil.rows[0].surname;
        const age = profil.rows[0].age;
        const tel = profil.rows[0].tel;
        const country = profil.rows[0].country;

        res.render('profile.ejs', { user, savedposts, profilimg, name, surname, age, tel, country,username });
    }
    catch(err){
        console.error('Database error:', err);
        res.render("profile.ejs", { message: 'An unexpected error occurred' });
    }
});


//profile update
app.post('/updateprofile', uploadProfile.single('profilimg'), async (req, res) => {
    try { 
        const user = req.session.user;
        if (!user) {
            return res.redirect('/');
        }
        const profil = await db.query('SELECT * FROM profile WHERE id = $1', [user.id]);
        const existingData = profil.rows[0];

        if (!existingData) {
            return res.render('profile.ejs', { message: 'Kullanıcı bulunamadı.' });
        }

        const { name, surname, username, password, age, country, tel } = req.body;
        
        console.log("Gelen Veriler:", req.body);  

        const updatedUsername = username || existingData.username;
        const updatedName = name || existingData.name;
        const updatedPassword = password || existingData.password;
        const updatedSurname = surname || existingData.surname;
        const updatedAge = age || existingData.age;
        const updatedCountry = country || existingData.country;
        const updatedTel = tel || existingData.tel;

        const currentImagePath = existingData.profilimg;
        const imagePath = req.file ? req.file.filename : currentImagePath || 'defaultprofil.jpeg';

        console.log("Yeni Profil Resmi:", imagePath); 

        const result = await db.query(
            `UPDATE profile 
            SET username = $1, password = $2, name = $3, surname = $4, age = $5, country = $6, tel = $7, profilimg = $8 
            WHERE id = $9 RETURNING id, name, profilimg`,
            [updatedUsername, updatedPassword, updatedName, updatedSurname, updatedAge, updatedCountry, updatedTel, imagePath, user.id]
        );

        if (result.rows.length > 0) {
            req.session.user = {
                id: result.rows[0].id,
                name: result.rows[0].name,
                profilimg: result.rows[0].profilimg,
            };
            req.session.message = 'Profil güncellendi';
            return res.redirect('/profile');
        } else {
            return res.render('profile.ejs', { message: 'Profil güncellenemedi.' });
        }

    } catch (err) {
        console.error('Database error:', err);
        res.render('profile.ejs', { message: 'Bir hata oluştu' });
    }
});



//login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM profile WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.session.user = {
                id: user.id,
                name: user.name,
                usersurname: user.surname,
                userage: user.age,
                usertel: user.tel,
                usercountry: user.country,
                profilimg: user.profilimg
            };
            console.log('Login successful');
            res.redirect('/home');
        } else {
            const message = 'Username or password is incorrect';
            console.log('Login failed' + message);
            res.render("login-register.ejs",{message});
            console.log('Login failed');
        }
    } catch (err) {
        console.error('Database error:', err);
        const message = 'An unexpected error occurred';
        res.render("index.ejs", { message });
    }
});


//register
app.post('/register', uploadProfile.single('profilimg'), async (req, res) => {
    const { username, password, name, surname, age, tel, country } = req.body;
    const imagePath = req.file ? req.file.filename : defaultImage;

    try {
        const checkResult = await db.query('SELECT * FROM profile WHERE username = $1', [username]);
        if (checkResult.rows.length > 0) {
            const message = 'Username already exists, try another one.';
            console.log('Registration failed:', message);
            res.render("login-register.ejs", { message});
        } else {
            const result = await db.query(
                'INSERT INTO profile (username, password, name, surname, age, tel, country ,profilimg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [username, password, name, surname, age, tel, country, imagePath]
            );
            req.session.user = { id: result.rows[0].id, name, surname, age, tel, country, profilimg: imagePath };
            console.log('Registration successful');
            res.redirect('/home');
        }
    } catch (err) {
        console.error('Database error:', err);
        const message = 'An unexpected error occurred';
        console.log('Registration failed:', message);
        res.render("login-register.ejs", { message });
    }
});

//logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/'); 
    });
})
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/'); 
    });
});

//recipe
app.get('/recipe', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }
    res.render('recipe.ejs', { user });
});




async function isValidImage(url) {
    try {
        const response = await fetch(url, { method: "HEAD" }); // Sadece başlıkları kontrol et
        return response.ok && response.headers.get("content-type").startsWith("image/");
    } catch (error) {
        console.error("Image validation error:", error);
        return false;
    }
}

async function fetchMealImage(mealName) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY; // .env dosyasından al
    const cx = process.env.GOOGLE_SEARCH_CX; // .env dosyasından al
    const query = encodeURIComponent(mealName + " food"); // Yemek ismiyle arama
    const url = `https://www.googleapis.com/customsearch/v1?q=${query}&cx=${cx}&searchType=image&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            const imageUrl = data.items[0].link; // İlk görselin URL'sini al

            if (await isValidImage(imageUrl)) {
                return imageUrl; // Eğer görsel geçerliyse kullan
            }
        }
    } catch (error) {
        console.error("Google Image API Error:", error);
    }

    return "/assets/default-food.png"; // Hata olursa default resmi kullan
}
//Generate Recipe
app.post('/search', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }

    const ingredients = req.body.ingredients;
    if (!ingredients) {
        return res.status(400).send("Please provide ingredients.");
    }
    console.log("Gelen Malzemeler:", ingredients);

    try {
        const prompt = `
        Kullanıcının elinde şu malzemeler var: ${ingredients}. 
        1. Bu malzemelerle yapılabilecek en iyi yemekleri listele.
        2. Her yemek için detaylı tarif ver verilen malzemelere göre dili ayarla yani ingilizce malzemeler verildiyse ingilizce tarif gibi.
        3. Yemekle alakalı web de veya youtube da video bul verilen malzemelerin diline göre videoları ona göre ver.
        4. Eğer bir yemekte eksik malzemeler varsa, eksik olanları ayrı bir liste olarak yaz dile göre ayarla malzemeleri.
        5. Eğer malzemeler Türkçe ise Türkçe yemek tarifleri getir, yabancı bir dilse örneğin İngilizce veya İspanyolca, ona uygun tarifler getir.
        Çıktıyı JSON formatında ver ve dili analiz ederek anahtar isimlerini şu şekilde sabit tut(json formatını düzgün ver ve **Not:**  YouTube linkleri genel arama sonuçlarına yönlendirir.  Daha spesifik tarif videoları bulmak için arama sorgularını daha detaylı hale getirmeniz gerekebilir.  Ayrıca,  tariflerde kullanılan yağ çeşidi (zeytinyağı, sıvıyağ vb.) gibi detaylar tarifin hazırlanış şekline göre değişebilir. bunu yazma hiç bi zaman.): 
        { "meals": [ { "name": "", "recipe": "", "video": "", "missingIngredients": [] } ] }
        `;

        const result = await model.generateContent(prompt);

        let responseText = result.response.candidates[0].content.parts[0].text;
        console.log("AI'den Gelen Yanıt:", responseText);

        // JSON formatını temizleme
        responseText = responseText.replace(/```[a-z]*\n/, "").replace(/```/, "").trim();

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (jsonError) {
            console.error("JSON Parsing Hatası:", jsonError);
            console.log("AI Yanıtı:", responseText);
            return res.status(500).send("AI JSON formatı hatalı.");
        }
        for (let meal of responseData.meals) {
            meal.image = await fetchMealImage(meal.name);
        }
        console.log("AI'den Gelen JSONv2:", responseData);

        res.render("recipe.ejs", { data: responseData, user });
    } catch (err) {
        console.error("Hata:", err);
        res.status(500).send("Sunucu hatası.");
    }
});


//save recipe
app.post('/save', async (req, res) => {
    const {name, recipe,video } = req.body;
    const userId = req.session.user ? req.session.user.id : null; 

    let missingIngredients = req.body.missingIngredients ? req.body.missingIngredients : [];

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Login again.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO saverecipe (user_id, recipename, recipe, recipevideo, missinging) VALUES ($1, $2, $3, $4, $5)',
            [userId, name, recipe, video,missingIngredients]
        );

        if (result.rowCount > 0) {
            req.session.message = 'Recipe is saved'; // Flash mesaj ekleme
            res.render("home.ejs", { message: 'Recipe is saved', user: req.session.user , profilimg: req.session.user.profilimg});
        } else {
            res.render("home.ejs", { message: 'An unexpected error occurred', user: req.session.user });
        }
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ success: false, message: 'An unexpected error occurred' });
    }
});

//delete recipe
app.post('/delete', async (req,res)=>{
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }

    const postId = req.body.postId;
    console.log("deleted postId:", postId);

    try{
        const result = await db.query('DELETE FROM saverecipe WHERE id = $1', [postId]);
        if(result.rowCount > 0){
            req.session.message = 'Recipe is deleted';
            res.redirect('/profile');
        }
        else{
            res.render("profile.ejs", { message: 'An unexpected error occurred' });
        }
    }
    catch{
        console.error('Database error:', err);
        res.render("profile.ejs", { message: 'An unexpected error occurred' });
    }

})


app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
