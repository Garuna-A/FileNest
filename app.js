const express = require("express")
const app = express();
const path = require("node:path")
const {PrismaClient} = require("./generated/prisma");
const passport = require("passport");
const prisma = new PrismaClient();
const Localstrategy = require("passport-local").Strategy;
const session = require("express-session")
const multer = require("multer")

app.use(session({
    secret:"secret",
    resave:false,
    saveUninitialized:false,
}))
app.use(passport.initialize());
app.use(passport.session());

app.set("views",path.join(__dirname,"views"))
app.set("view engine","ejs")
app.use(express.urlencoded({ extended: true }));

passport.use(
    new Localstrategy(async(username,password,done)=>{
        try{
            const user = await prisma.user.findUnique({where:{username}});
            if(!user){
                return done(null, false, {message: "No user found"});
            }

            if(password !== user.password){
                return done(null,false, {message: "Incorrect password"});
            }
            return done(null,user)
        }
        catch(err){
            return done(err)
        }
    })
)

passport.serializeUser((user,done)=>{
    done(null,user.id);
})

passport.deserializeUser(async(id,done)=>{
    try{
        const user = await prisma.user.findUnique({where:{id}});
        done(null,user);
    }catch(err){
        done(err);
    }
})

const storage = multer.diskStorage({
    destination : function(req, file, cb){
        cb(null,"uploads/");
    },
    filename: function(req,file,cb){
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random()*1E9);
        cb(null, uniqueSuffix+path.extname(file.originalname))
    }
});

const upload = multer({storage:storage});

app.get("/", (req,res)=>{
    res.redirect("/login")
})
app.get("/login", (req,res)=>{
    res.render("login")
})
app.post("/login", passport.authenticate("local",{
    successRedirect: "/upload",
    failureRedirect: "/login",
}))

function ensureAuthenticated(req,res,next){
    if(req.isAuthenticated()) return next();
    res.redirect("/login")
}

app.get("/sign-up", (req,res)=>{
    res.render("sign-up");
})

app.post("/sign-up", async (req,res)=>{
    const {username, password} = req.body;

    try{
        await prisma.user.create({
            data: {
                username,
                password,
            },
        })
        res.redirect("/login")
    } catch(err){
        console.log(err);
        res.send("Error creating user")
    }
})
app.get("/folder",ensureAuthenticated, (req,res)=>{
    res.render("folders")
})
app.post("/create-folder",ensureAuthenticated,async(req,res)=>{
    const {folderName} = req.body;
    try{
        await prisma.folder.create({
            data:{
                name: folderName,
                userId: req.user.id,
            }
        })
        res.redirect("/upload")
    }catch(err){
        console.error(err);
        res.status(500).send("Error creating folder");
    }
})
app.get("/upload", ensureAuthenticated,async(req,res)=>{
    const userFolders = await prisma.folder.findMany({
        where: {userId: req.user.id}
    })
    res.render("upload", {userFolders})
})
app.post("/upload", ensureAuthenticated,upload.single('myFile'), (req,res)=>{
    const folderId = req.body.folderId ? parseInt(req.body.folderId):null;
    if(!req.file){
        return  res.status(400).send("No file uploaded")
    }
    try{
        prisma.file.create({
            data:{
                filename: req.file.originalname,
                filepath: req.file.path,
                userId: req.user.id,
                folderId: folderId,
            }
        })
        res.send("File uploaded and save in DB");
    }
    catch(err){
        console.error(err);
        res.status(400).send("Error saving file to database")
    }
})

app.listen(3000,()=>{
    console.log("Listening at http://localhost:3000")
})