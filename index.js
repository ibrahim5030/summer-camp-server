const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }

  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x8z9fws.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
    // await client.connect();

    const sportsCollection = client.db('sportsDB').collection('sportsdata');
    const usersCollection = client.db("sportsDB").collection("users");
    const classCollection = client.db("sportsDB").collection("classes");
    const paymentCollection = client.db("sportsDB").collection("payments");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token });
    })

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'Admin') {
        return res.status(403).send({ error: true, message: 'forbidden' })
      }
      next();
    }

    // sports users api

    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      return res.send(result);
    })


    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'existing user' })
      }
      const result = await usersCollection.insertOne(user);
      return res.send(result)
    })

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false })
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'Admin' }
      return res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Admin"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      return res.send(result);
    })

    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ instructor: false })
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'Instructor' }
      return res.send(result);
    })

    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Instructor"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      return res.send(result);
    })

    // sports data api
    app.get('/sports', async (req, res) => {      
      const query = {};
      const options = {
        sort: { "num_students": -1 }
      }
      const result = await sportsCollection.find(query, options).toArray();
      return res.send(result);
    })

    app.get('/sports/:id', async (req, res) => { 
      const id = req.params.id;     
      const result = await sportsCollection.find({_id: new ObjectId(id)}).toArray();
      return res.send(result);
    })

    app.post('/sports', async (req, res) => {
      const classes = req.body;      
      const result = await sportsCollection.insertOne(classes);
      return res.send(result)
    })

    app.patch('/sports/:id', async (req, res) => { 
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const sendFeedback = req.body;
      const feedback = {
        $set: {
          feedback: sendFeedback.feedback          
        }
      }
      const result = await sportsCollection.updateOne(filter, feedback);
      res.send(result);
    })
    
    app.patch('/sports/approved/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved"
        },
      };
      const result = await sportsCollection.updateOne(filter, updateDoc);
      return res.send(result);
    });

    app.patch('/sports/denied/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "denied"
        },
      };
      const result = await sportsCollection.updateOne(filter, updateDoc);
      return res.send(result);
    })


    // selected class api

    app.get('/classes', verifyJWT, async (req, res) => { 
      
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }

      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      return res.send(result);
    })

    app.get('/classes/:id', async(req, res)=>{
      const id = req.params.id;     
      const result = await classCollection.find({_id: new ObjectId(id)}).toArray();
      return res.send(result);
    })

    app.post('/classes', async (req, res) => {
      const selected = req.body;
      console.log(selected);
      const result = await classCollection.insertOne(selected);
      return res.send(result);
    })

    app.delete('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      return res.send(result);
    })


    // my classes api
    app.get('/myclasses', async (req, res) => {      
      const email = req.query.email;
      const query = {email: email};
      console.log(query);      
      const result = await sportsCollection.find(query).toArray();
      return res.send(result);
    })

    app.get('/myclasses/:id', async (req, res) => { 
      const id = req.params.id;     
      const result = await sportsCollection.find({_id: new ObjectId(id)}).toArray();
      return res.send(result);
    })

    app.patch('/myclasses/:id', async (req, res) => { 
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const update = req.body;
      const price = {
        $set: {
          price: update.price          
        }
      }
      const result = await sportsCollection.updateOne(filter, price);
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', verifyJWT, async(req, res)=>{
      const {price} = req.body;
      const amount = parseInt(price*100);
      const paymentIntent = await stripe.paymentIntents.create({amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
      });
      return res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // payment api

    app.get('/payments', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if(!email){
        return res.send([]);
      }
      const query = {email: email};
      const options = {
        sort: { "date": -1 }
      }
      const result = await paymentCollection.find(query, options).toArray();
      return res.send(result);
    })

    app.post('/payments', verifyJWT, async(req, res)=>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const id = payment.course;
      const query = {_id: new ObjectId(id)};
      const deleteResult = await classCollection.deleteOne(query);
      
      const updateId = payment.classId;
      const updateQuery = {_id: new ObjectId(updateId)};
      const updateDoc = {
        $inc: {
          num_students: +1,
          available_seats: -1
        }
      };
      const updateResult = await sportsCollection.updateOne(updateQuery, updateDoc);

      return res.send({insertResult, deleteResult, updateResult});
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('sports server is running')
})

app.listen(port, () => {
  console.log(`sports server is running on port: ${port}`)
})