const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./digital-life-lessons-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// Global collections
let usersCollection;
let lessonsCollection;

// MongoDB connection
const client = new MongoClient(process.env.MONGO_URI || `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yh13yvx.mongodb.net/?appName=Cluster0`, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

//middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async(req,res,next)=>{
// console.log('headers in the middleware',req.headers.authorization)
const token = req.headers.authorization;
if(!token){
  return res.status(401).send({message: 'unauthorized access'})
}

try{
  const idToken = token.split(' ')[1];
  const decoded = await admin.auth().verifyIdToken(idToken)
  console.log('decoded in the token',decoded);
  req.decoded_email = decoded.email
  next()
}
catch(err){
return res.status(401).send({message: 'unauthorized access'})
}


}

async function run() {
  try {
    await client.connect();
    const db = client.db('digital_lesson_db');
    usersCollection = db.collection('users');
    lessonsCollection = db.collection('lessons');

    console.log('MongoDB connected successfully');

    // Create or get user
    app.post('/users', async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });

      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: existingUser._id });
      }

      const newUser = {
        ...user,
        isPremium: false,
        joinDate: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // Get user premium 
    app.get('/users/status/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) return res.status(404).send({ message: 'User not found' });

        res.send({
          isPremium: user.isPremium || false,
          dbId: user._id.toString(),
        });
      } catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    // Make user Premium 
    app.patch('/users/make-premium/:id', async (req, res) => {
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { isPremium: true, premiumTakenAt: new Date() } }
        );
        res.send({ message: 'User upgraded to premium', modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).send({ error: 'Failed to upgrade user' });
      }
    });

    //update user
    app.patch('/users/:id',async(req,res)=>{
      const id = req.params.id;
      const updateUser = req.body
      const query = {_id: new ObjectId(id)}
      const update = {
        $set:{
          name:updateUser.name,
          photoURL: updateUser.photoURL
        }
      }
      const option = {}
      const result = await usersCollection.updateOne(query,update,option)
      res.send(result)
    })

    // Get lessons (all or by user) app.get('/lessons', verifyFBToken, async (req, res) => { const query = req.query.email ? { createdBy: req.query.email } : {}; const lessons = await lessonsCollection.find(query).sort({ createdAt: -1 }).toArray(); res.send(lessons); });
//public lesson 
//  app.get('/lessons/public', async (req, res) => {
//   const lessons = await lessonsCollection
//     .find({ isPublic: true })
//     .sort({ createdAt: -1 })
//     .toArray();

//   res.send(lessons);
// });

app.get('/lessons/public', async (req, res) => {
  const lessons = await lessonsCollection.find({}).toArray();
  res.send(lessons);
});


//my lesson
app.get('/lessons/my', verifyFBToken, async (req, res) => {
  const email = req.decoded_email;

  const lessons = await lessonsCollection
    .find({ createdBy: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(lessons);
});



    // Create lesson
    app.post('/lessons',verifyFBToken, async (req, res) => {
      const lesson = { 
        ...req.body,
        createdBy: req.decoded_email,
         createdAt: new Date() };
      const result = await lessonsCollection.insertOne(lesson);
      res.send(result);
    });

    // Delete lesson
    app.delete('/lessons/:id',verifyFBToken, async (req, res) => {
      const result = await lessonsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.get('/', (req, res) => {
      res.send('Digital Life Lesson Server is running ');
    });

  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
