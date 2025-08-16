require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfkit = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 5000;

//configure multer for file upload
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));


//initilize genai
const genai = new GoogleGenerativeAI(process.env.GeminiApiKey);
app.use(express.static("public"));


//routes

//analyze
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Pleasr upload an image" });
    }
    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, {
      encoding: "base64",
    });
    //Use the gemini api to analyze the image
    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
    });
    const result = await model.generateContent([
      "Analyze this plant image and provide detailed analysis of its species, health status, and any potential diseases or pests, its characteristics, how to take care of it and any interesting facts. Please provide the response in plain text without using any markdown formatting",
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);
    const plantInfo = result.response.text();
    // remove the uploaded image
    await fsPromises.unlink(imagePath);
    // send the response
    res.json({
      result: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while analysing the image" });
  }
});
app.post("/download", express.json(), async (req, res) => {
  const { result, image } = req.body;
  try {
    //Ensure that report directory exists
    const reportDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportDir, { recursive: true });
    //generate the pdf report
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    const doc = new pdfkit();
    doc.pipe(writeStream);
    // Add content to the PDF document
    doc.fontSize(20).text("Plant Analysis Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(24).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    //insert image in pdf
      if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.moveDown();
      doc.image(buffer, {
        fit: [500, 300],
        align: "center",
        valign: "center",
      });
    }
    
    doc.fontSize(14).text(result, { align: "justify" });
    
    
    doc.end();
    //wait for the pdf to be created
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    res.download(filePath, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Failed to download the PDF report");
      }
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Failed to generate and download the PDF report" });
  }
});

//start the serve
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
