const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const port =process.env.PORT|| 3000

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yh13yvx.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();  

const db = client.db('digital_lesson_db')
const lessonsCollection = db.collection('lessons');
const usersCollection = db.collection('users');

//user api

app.post('/users', async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  
  const existingUser = await usersCollection.findOne(query);
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



//premium update api
app.patch("/users/premium/:email", async (req, res) => {
      const email = req.params.email;

      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { isPremium: true } }
      );

      res.send(result);
    });



//lessons api
app.get('/lessons', async (req, res) => {
  try {
    const query = {};
    const email = req.query.email;

    if (email) {
      query.createdBy = email;
    }

    const result = await lessonsCollection.find(query).sort({ createdAt: -1 }).toArray();

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to fetch lessons' });
  }
});


app.post('/lessons',async(req,res)=>{
    const lesson = req.body;
     lesson.createdAt = new Date();
    const result = await lessonsCollection.insertOne(lesson)
    res.send(result)
})

//delete
app.delete('/lessons/:id',async(req,res)=>{
  const id = req.params.id;
  const query = {_id: new ObjectId(id)}
  const result = await lessonsCollection.deleteOne(query)
  res.send(result)
})

//payment related apis
app.post('/create-checkout-session',async(req,res)=>{
  const {userEmail,userId} = req.body;
  const AMOUNT_BDT = 1500;
  const UNIT_AMOUNT = AMOUNT_BDT * 100;
   const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
        price_data:{
          currency:'BDT',
          unit_amount:UNIT_AMOUNT,
           product_data: {
              name: "Lifetime Premium Access",
              description: "Get unlimited premium lessons forever."
            },
        },
        
        quantity: 1,
      },
    ],
    customer_email:userEmail,
    mode: 'payment',
    metadata:{
      userId:userId
    },
    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
  });
console.log(session)
res.send({url:session.url})
})

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('digital life lesson server is running...!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
