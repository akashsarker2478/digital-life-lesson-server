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
let reportsCollection;

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
  req.decoded_email = decoded.email;
  req.decoded_name = decoded.name;
  next()
}
catch(err){
return res.status(401).send({message: 'unauthorized access'})
}
}

// VERIFY ADMIN (ADMIN ONLY)
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded_email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admin only" });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    const db = client.db('digital_lesson_db');
    usersCollection = db.collection('users');
    lessonsCollection = db.collection('lessons');
    reportsCollection = db.collection('reports'); 

    console.log('MongoDB connected successfully');
//post user api
    app.post('/users', async (req, res) => {
  const user = req.body; 

  const query = { email: user.email };

  const userDataToSave = {
    email: user.email,
    name: user.name || user.displayName || user.email.split('@')[0],
    photoURL: user.photoURL || null, 
    role: "user", 
    isPremium: false, 
    joinDate: new Date()
  };

  const existingUser = await usersCollection.findOne(query);

  if (existingUser) {
    
    await usersCollection.updateOne(
      query,
      { 
        $set: {
          name: userDataToSave.name,
          photoURL: userDataToSave.photoURL,
          
        }
      }
    );
    return res.send({ message: 'User profile updated (including photo)' });
  }

  // New user
  await usersCollection.insertOne({
    ...userDataToSave,
    isPremium: false,
    joinDate: new Date()
  });
  res.send({ message: 'New user created with photo' });
});

// Check admin role
app.get("/users/admin/:email", async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });

  res.send({
    admin: user?.role === "admin"
  });
});

// Make user admin
app.patch("/users/make-admin/:email",verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;

  const result = await usersCollection.updateOne(
    { email },
    { $set: { role: "admin" } }
  );

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


//get lessons
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

//get favorite api 
app.get('/lessons/favorites', verifyFBToken, async (req, res) => {
  const email = req.decoded_email;

  try {
    const lessons = await lessonsCollection.find({
      $or: [
    { favorites: email },
    { favorites: { $in: [email] } }
  ]
    }).toArray();

    res.send(lessons);
  } catch (error) {
    res.status(500).send({
      message: 'Failed to fetch favorite lessons'
    });
  }
});

//single lessons
app.get('/lessons/:id', verifyFBToken, async (req, res) => {
  const  id  = req.params.id;
 const query = {_id:new ObjectId(id)}
 const result = await lessonsCollection.findOne(query)
 res.send(result)
});

// Toggle like for a lesson
app.patch('/lessons/:id/like', verifyFBToken, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.decoded_email;

  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) });
    if (!lesson) return res.status(404).send({ message: 'Lesson not found' });

    const currentLikes = Array.isArray(lesson.likes) ? lesson.likes : [];

    let updatedLikes;
    if (currentLikes.includes(userEmail)) {
      // Remove like
      updatedLikes = currentLikes.filter(email => email !== userEmail);
    } else {
      // Add like
      updatedLikes = [...currentLikes, userEmail];
    }

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { likes: updatedLikes, likesCount: updatedLikes.length } }
    );

    res.send({ message: 'Like updated', likesCount: updatedLikes.length });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).send({ message: 'Server error', error: err.message });
  }
});




// Toggle favorite for a lesson
app.patch('/lessons/:id/favorite', verifyFBToken, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.decoded_email;

  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) });
    if (!lesson) return res.status(404).send({ message: 'Lesson not found' });
    
    let updatedFavorites;
    if (lesson.favorites?.includes(userEmail)) {
      updatedFavorites = lesson.favorites.filter(email => email !== userEmail);
    } else {
      updatedFavorites = [...(lesson.favorites || []), userEmail];
    }

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { favorites: updatedFavorites, favoritesCount: updatedFavorites.length } }
    );

    res.send({ message: 'Favorites updated', favoritesCount: updatedFavorites.length });
  } catch (err) {
    res.status(500).send({ message: 'Server error', error: err.message });
  }
});

// Author Info API
app.get('/authors/:email', async (req, res) => {
  const { email } = req.params;

  try {
    // Author info from users collection
    const author = await usersCollection.findOne({ email });

    if (!author) return res.status(404).send({ message: "Author not found" });

    // Total lessons created by this author
    const totalLessons = await lessonsCollection.countDocuments({ createdBy: email });

    res.send({
      name: author.name,
      photoURL: author.photoURL || null,
      totalLessons,
      email: author.email
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});

// Get all lessons by a specific author
app.get('/lessons/by-author/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const lessons = await lessonsCollection
      .find({ createdBy: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(lessons);
  } catch (error) {
    console.error("Error fetching lessons by author:", error);
    res.status(500).send({ message: "Failed to fetch lessons" });
  }
});

//report collection api
app.post('/lessons/report', verifyFBToken, async (req, res) => {
  const { lessonId, reason, reportedUserEmail } = req.body;

  if (!lessonId || !reason || !reportedUserEmail) {
    return res.status(400).send({ message: "All fields are required" });
  }

  try {
    const report = {
      lessonId: new ObjectId(lessonId),
      reportedBy: req.decoded_email, 
      reportedUserEmail,             
      reason,
      createdAt: new Date()
    };

    const result = await reportsCollection.insertOne(report);
    res.send({ message: 'Report submitted successfully', insertedId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to submit report' });
  }
});


    // Add comment
    app.post('/lessons/:id/comment', verifyFBToken, async (req, res) => {
      const { text } = req.body;
      const comment = {
        userId: req.decoded_email,
        userName: req.decoded_name,
        text,
        createdAt: new Date()
      };

      await lessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { comments: comment } }
      );
      res.send(comment);
    });

    //get comment
 app.get('/lessons/:id/comments', async (req, res) => {
  const lesson = await lessonsCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.send({ comments: lesson.comments || [] });
});


    // Get similar lessons
    app.get('/lessons/similar/:id', async (req, res) => {
      const lesson = await lessonsCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!lesson) return res.status(404).send({ message: 'Lesson not found' });

      const similar = await lessonsCollection
        .find({
          _id: { $ne: lesson._id },
          $or: [{ category: lesson.category }, { tone: lesson.tone }]
        })
        .limit(6)
        .toArray();

      res.send(similar);
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

  // Update lesson
app.patch('/lessons/:id', verifyFBToken, async (req, res) => {
  const { id } = req.params;
  const email = req.decoded_email;
  const updatedData = req.body;

  try {
    // Ensure only owner can update
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) });

    if (!lesson) {
      return res.status(404).send({ message: 'Lesson not found' });
    }

    if (lesson.createdBy !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...updatedData,
          updatedAt: new Date()
        }
      }
    );

    res.send({ message: 'Lesson updated successfully', modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).send({ message: 'Failed to update lesson' });
  }
});


    // Delete lesson
    app.delete('/lessons/:id',verifyFBToken, async (req, res) => {
      const result = await lessonsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // Get all users - Admin only
app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    const sanitizedUsers = users.map(user => ({
      ...user,
      _id: user._id.toString()
    }));
    res.send(sanitizedUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Failed to fetch users" });
  }
});

// Get all reports - Admin only
app.get('/reports', verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const reports = await reportsCollection.find({}).toArray();
    const sanitizedReports = reports.map(report => ({
      ...report,
      _id: report._id.toString(),
      lessonId: report.lessonId.toString()
    }));
    res.send(sanitizedReports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).send({ message: "Failed to fetch reports" });
  }
});

// Delete user account - Admin only
app.delete('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    //don't delete my account delete 
    const userToDelete = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!userToDelete) {
      return res.status(404).send({ message: "User not found" });
    }

    if (userToDelete.email === req.decoded_email) {
      return res.status(403).send({ message: "You cannot delete your own account!" });
    }

    // User-all lesson delete
    await lessonsCollection.deleteMany({ createdBy: userToDelete.email });

    // User delete
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      res.send({ message: "User deleted successfully", deletedCount: 1 });
    } else {
      res.status(400).send({ message: "Failed to delete user" });
    }
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).send({ message: "Server error" });
  }
});

    app.get('/', (req, res) => {
      res.send('Digital Life Lesson Server is running ');
    });

  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

// Toggle Featured - Admin only 
app.patch('/lessons/:id/featured', verifyFBToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(id) });
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    const newStatus = !lesson.isFeatured;

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isFeatured: newStatus } }
    );

    res.send({
      message: newStatus ? "Featured" : "Unfeatured",
      isFeatured: newStatus,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

// Clear all reports for a lesson - Admin only
app.delete('/reports/lesson/:lessonId', verifyFBToken, verifyAdmin, async (req, res) => {
  const { lessonId } = req.params;

  try {
    const result = await reportsCollection.deleteMany({
      lessonId: new ObjectId(lessonId)
    });
    res.send({ message: "Reports cleared", deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
