const express = require("express")
const app = express();
const path = require("node:path")
const {PrismaClient} = require("./generated/prisma");
const passport = require("passport");
const prisma = new PrismaClient();
const Localstrategy = require("passport-local").Strategy;
const session = require("express-session")
const multer = require("multer")
const cloudinary = require("cloudinary").v2;
const {CloudinaryStorage} = require("multer-storage-cloudinary");
const cors = require("cors");
const { error } = require("node:console");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: "https://filenest-nine.vercel.app", 
    credentials: true,
}));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

const storage = new CloudinaryStorage({
    cloudinary,
    params:{
        folder: "filenest",
        resource_type: "auto"
    },
})

const upload = multer({ storage });

app.use(session({
    secret:"secret",
    resave:false,
    saveUninitialized:false,
    cookie:{
        secure: true,
        sameSite: 'none'
    }
}))
app.use(passport.initialize());
app.use(passport.session());

app.set("views",path.join(__dirname,"views"))
app.set("view engine","ejs")

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

// const storage = multer.diskStorage({
//     destination : function(req, file, cb){
//         cb(null,"uploads/");
//     },
//     filename: function(req,file,cb){
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random()*1E9);
//         cb(null, uniqueSuffix+path.extname(file.originalname))
//     }
// });


// const upload = multer({storage:storage});

app.get("/", (req,res)=>{
    res.redirect("/login")
})

app.post("/login", (req, res, next) => {
    console.log("POST /login called");
    console.log("Body:", req.body);
  
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("Passport error:", err);
        return res.status(500).json({ message: "Internal error" });
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
  
      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        return res.status(200).json({ message: "Login successful" });
      });
    })(req, res, next);
});
  

function ensureAuthenticated(req,res,next){
    if(req.isAuthenticated()) return next();

    if (req.headers.accept.includes("application/json")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    res.redirect("/login")
}

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

app.post("/folder", ensureAuthenticated, async (req, res) => {
    const { folderName } = req.body;
    try {
      const folder = await prisma.folder.create({
        data: {
          name: folderName,
          userId: req.user.id,
        },
      });
      res.status(200).json({ folder });
    } catch (err) {
      console.error("Folder creation failed", err);
      res.status(500).json({ error: "Failed to create folder" });
    }
});  
app.get("/folder-list", ensureAuthenticated, async (req, res) => {
    const folders = await prisma.folder.findMany({
      where: { userId: req.user.id },
    });
    res.json({ folders });
});
app.get("/dashboard",ensureAuthenticated,async(req,res)=>{
    try{

        const folders = await prisma.folder.findMany({
            where:{userId: req.user.id}
        })
        const files = await prisma.file.findMany({
            where: {userId: req.user.id}
        })
        // res.render("dashboard",{files, folders})
        res.status(200).json({folders,files});
    }catch(err){
        console.error("Error loading data", err);
        res.status(500).json({error:"Database error"});
    }
})
app.use("/uploads", express.static("uploads"));
app.delete("/delete-file", async (req, res) => {
    try {
        const fileId = parseInt(req.body.fileId);
        await prisma.file.delete({
            where: { id: fileId },
        });
        res.status(200).json({ message: "File deleted" });
    } catch (err) {
        console.error("Failed to delete file:", err);
        res.status(500).json({ error: "Deletion failed" });
    }
});
app.get("/folder/:id",ensureAuthenticated,async(req,res)=>{
    const folderId = parseInt(req.params.id)
    try{
        const folder = await prisma.folder.findUnique({
            where: {id: folderId},
            include:{
                file: true,
            }
        });
        if(!folder){
            return res.send("Folder not found");
        }
        res.status(200).json({
            folder: {
              id: folder.id,
              name: folder.name,
            },
            files: folder.file, 
        });
    }catch(err){
        console.error(err);
        console.error("Error loading files", err);
        res.status(400).json({error:"Error loading folder"});
    }
})
// app.get("/upload", ensureAuthenticated,async(req,res)=>{
//     const userFolders = await prisma.folder.findMany({
//         where: {userId: req.user.id}
//     })
//     res.render("upload", {userFolders})
// })
app.post("/upload", ensureAuthenticated,upload.single('myFile'), async(req,res)=>{
    const folderId = req.body.folderId ? parseInt(req.body.folderId):null;
    if(!req.file){
        return  res.status(400).send("No file uploaded")
    }
    try{
        await prisma.file.create({
            data:{
                filename: req.file.originalname,
                fileUrl: req.file.path,
                userId: req.user.id,
                folderId: folderId,
            }
        })
        res.redirect("/dashboard");
    }
    catch(err){
        console.error(err);
        res.status(400).send("Error saving file to database")
    }
})
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    if (req.headers.accept?.includes("application/json")) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.status(500).send("Internal server error");
    }
  });

app.listen(3000,()=>{
    console.log("Listening at http://localhost:3000")
})