const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require('mongodb');
const stripe = require("stripe")(process.env.DB_payment_key);

const admin = require("firebase-admin");

const decodedKey = Buffer.from(process.env.FB_service_Key , 'base64').toString('utf8')
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.a2iwzfm.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {

    // await client.connect();

    const db = client.db("tShirtDB");
    const tShirtCollection = db.collection("tShirts");
    const cartCollection = db.collection('carts');
    const paymentCollection = db.collection('payments')
    const userCollection = db.collection("users");


    const verifyToken = async (req, res, next) => {

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token" });
      }

      const idToken = authHeader.split(" ")[1];

      if (!idToken) {
        return res.status(401).json({ message: "Unauthorized: No token" });
      }

      // verified 
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
      } catch (error) {
        return res.status(403).json({ message: "Forbidden: Invalid token" });
      }
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(401).json({ message: "Unauthorized: No token" });

      }
      next();
    }




    // GET /users/search?email=gmail
    app.get("/users/search",verifyToken,verifyAdmin, async (req, res) => {
      try {
        const searchEmail = req.query.email || ""; 

        const query = searchEmail
          ? { email: { $regex: searchEmail, $options: "i" } }
          : {}; 

        const users = await userCollection.find(query).toArray();
        res.send(users);
      } catch (err) {
        res.status(500).json({ message: "Failed to search users", error: err.message });
      }
    });

    app.get("/users/role/:email",verifyToken,verifyAdmin, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ success: false, message: "User not found" });
        }

        res.send({
          success: true,
          email: user.email,
          role: user.role || "user",
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    app.patch("/users/role/:id", verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body; 

      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: role }
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating role", error });
      }
    });




    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users",verifyToken,verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.put("/users/email/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { name, profilePic } = req.body;

        const result = await userCollection.updateOne(
          { email: email },
          { $set: { name, profilePic } }
        );

        res.send(result);
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });


    // get single cart item by id
    app.get("/carts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const item = await cartCollection.findOne({ _id: new ObjectId(id) });
        if (!item) return res.status(404).send({ message: "Cart item not found" });
        res.send(item);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch cart item" });
      }
    });


    app.post("/carts", async (req, res) => {
      const item = req.body;

      const exists = await cartCollection.findOne({
        userEmail: item.userEmail,
        tShirtId: item.tShirtId
      });

      if (exists) {
        return res.send({ message: "Item already in cart", insertedId: null });
      }

      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.userEmail;
      const result = await cartCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.patch("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const { quantity } = req.body;

      const result = await cartCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { quantity } }
      );

      res.send(result);
    });


    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;

      const result = await cartCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    app.delete("/carts/user/:email", async (req, res) => {
      const email = req.params.email;

      const result = await cartCollection.deleteMany({
        userEmail: email,
      });

      res.send(result);
    });





    //create api of tshirt
    app.post("/tShirts",verifyToken, async (req, res) => {
      try {
        const data = req.body;


        // Auto discount price
        const price = parseFloat(data.price);
        const discount = parseFloat(data.discount) || 0;
        const discountPrice = price - (price * (discount / 100));

        console.log(data);

        const newTshirt = {
          title: data.title,
          price: price,
          discount: discount,
          discountPrice: discountPrice,
          description: data.description,
          color: data.color,
          size: data.size,
          quantity: parseInt(data.quantity),
          category: data.category,
          brand: data.brand,
          stockStatus: data.stockStatus,
          sellerEmail: data.sellerEmail,
          image: data.image,
          createdAt: new Date(),
        };

        const result = await tShirtCollection.insertOne(newTshirt);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error adding t-shirt", error });
      }
    });


    // GET all tShirts OR filter by sellerEmail
    app.get("/tShirts", async (req, res) => {
      try {
        const sellerEmail = req.query.sellerEmail;
        let query = {};

        if (sellerEmail) {
          query = { sellerEmail: sellerEmail };
        }

        const data = await tShirtCollection.find(query).toArray();
        res.send(data);
      } catch (error) {
        res.status(500).send({ message: "Error fetching t-shirts", error });
      }
    });




    app.get("/tShirts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const item = await tShirtCollection.findOne({ _id: new ObjectId(id) });

        if (!item) return res.status(404).send({ message: "Not found" });

        res.send(item);
      } catch (error) {
        res.status(500).send({ message: "Error fetching t-shirt", error });
      }
    });

    app.patch("/tShirts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const body = req.body;
        const file = req.file;

        let updateData = { ...body };

        if (file) {
          updateData.image = file.filename;
        }

        if (body.price && body.discount) {
          const p = parseFloat(body.price);
          const d = parseFloat(body.discount);
          updateData.discountPrice = p - (p * d / 100);
        }

        const result = await tShirtCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update error", error });
      }
    });


    app.delete("/tShirts/:id",verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await tShirtCollection.deleteOne({ _id: new ObjectId(id) });

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Delete error", error });
      }
    });


    // payment routes
    app.get('/payments/seller/:email', async (req, res) => {
      const sellerEmail = req.params.email;

      try {

        const payments = await paymentCollection.find({ sellerEmail }).sort({ createdAt: -1 }).toArray();

        res.send(payments);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching payment history', error });
      }
    });

    app.get("/payments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const payment = await paymentCollection.findOne({ _id: new ObjectId(id) });

        res.send({ success: true, data: payment });
      } catch (err) {
        res.status(500).send({ success: false, message: err.message });
      }
    });

    app.get("/payments",verifyToken,verifyAdmin, async (req, res) => {
      try {
        const email = req.query.email;
        let query = {};

        if (email) {
          query = { userEmail: email };
        }

        const payments = await paymentCollection.find(query).sort({createdAt : -1}).toArray();

        res.send({
          success: true,
          data: payments,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch payments",
          error: error.message,
        });
      }
    });


    app.post("/payments", async (req, res) => {
      try {
        const { cartId, userEmail, priceTk, sellerEmail, transactionId, paymentMethod } = req.body;

        const query = { _id: new ObjectId(cartId) };

        await cartCollection.updateOne(query, {
          $set: {
            status: "paid",
            transactionId: transactionId,
          },
        });

        const paymentDoc = {
          cartId: new ObjectId(cartId),
          userEmail,
          sellerEmail,
          priceTk,
          paymentMethod,
          transactionId,
          status: "success",
          paidAt: new Date(),
          createdAt: new Date(),
        };

        const paymentResult = await paymentCollection.insertOne(paymentDoc);

        res.send({
          success: true,
          insertedId: paymentResult.insertedId,
          message: "Payment saved successfully",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Payment processing failed",
          error: error.message,
        });
      }
    });


    app.post('/create-payment-intent', async (req, res) => {
      try {
        const { amountCents } = req.body;
        console.log(amountCents);

        if (!amountCents || amountCents <= 0) {
          return res.status(400).send({ message: "Invalid payment amount" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amountCents),
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });

      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });




    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("Backend is running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));