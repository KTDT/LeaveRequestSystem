require('dotenv').config(); // This loads the variables
const express = require("express");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { PDFDocument, degrees } = require("pdf-lib");

const app = express();
app.use(express.json({ limit: "20mb" })); // Increased limit for photo attachments
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static("public"));

const SECRET = "123456";
const USERS = [{ username: "Test", password: "1111", role: "Employee" }];

// EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 2525, // Change from 587 to 2525
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});
    tls: {
        rejectUnauthorized: false, // Keeps connection from dropping due to cert issues
        minVersion: 'TLSv1.2'      // Ensures modern security
    }
});

app.post("/submit", async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Supervisor Routing
        const shiftRouting = {
            "dayshift": "day_sup1@example.com, day_sup2@example.com",
            "evenings": "eve_sup1@example.com",
            "midnights": "mid_sup1@example.com, mid_sup2@example.com"
        };
        const recipientEmail = shiftRouting[data.shift] || "KDT3test@gmail.com";

        if (!fs.existsSync("leave_form.pdf")) {
            return res.status(500).send("PDF template missing on server");
        }
        
        // 2. Load PDF and setup Page
        const pdfBytes = fs.readFileSync("leave_form.pdf");
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        const firstPage = pdfDoc.getPages()[0];
        firstPage.setRotation(degrees(0));

        // 3. safeFill function
        const safeFill = (name, val) => {
            try { 
                const field = form.getTextField(name);
                field.setText(String(val || ""));
                field.setFontSize(0); // Enable auto-shrinking text
            } catch (e) {
                console.log(`Field not found: ${name}`);
            }
        };

        // 4. Fill the Fields
        safeFill("Date Submitted", new Date().toLocaleDateString());
        safeFill("Employee Name", data.employeeName);
        safeFill("PIN", data.pin);
        safeFill("BureauSection", "SOD/Port");
        safeFill("Dates RequestedAnnual Leave", data.annualDates);
        safeFill("Dates RequestedSick Leave", data.sickDates);
        safeFill("Dates RequestedPersonal Leave", data.personalDates);
        safeFill("Dates RequestedCompensatory Leave", data.compDates);
        safeFill("Dates RequestedOther", data.otherDates);
        safeFill("Number of HoursAnnual Leave", data.annualHours);
        safeFill("Number of HoursSick Leave", data.sickHours);
        safeFill("Number of HoursPersonal Leave", data.personalHours);
        safeFill("Number of HoursCompensatory Leave", data.compHours);
        safeFill("Number of HoursOther", data.otherHours);
        safeFill("Remarks", data.remarks);

        // 5. Handle Signature
        if (data.signature) {
            try {
                const sigData = data.signature.split(',')[1];
                const pngImage = await pdfDoc.embedPng(Buffer.from(sigData, 'base64'));
                const sigButton = form.getButton("Employees Signature");
                const widgets = sigButton.acroField.getWidgets();

                if (widgets.length > 0) {
                    const rect = widgets[0].getRectangle();
                    firstPage.drawImage(pngImage, {
                        x: rect.x + rect.width, 
                        y: rect.y,
                        width: rect.height, 
                        height: rect.width,
                        rotate: degrees(90) 
                    });
                }
            } catch (sigErr) {
                console.error("Signature Error:", sigErr);
            }
        }

        const pdfBytesFilled = await pdfDoc.save();

        // 6. Setup Attachments Array
        const emailAttachments = [{
            filename: `LeaveRequest_${data.employeeName}.pdf`,
            content: Buffer.from(pdfBytesFilled)
        }];

        // Handle Medical/Sick Note Attachment
        if (data.medicalNote && data.medicalNote.includes("base64,")) {
            const base64Content = data.medicalNote.split("base64,")[1];
            emailAttachments.push({
                filename: data.medicalNoteName || "attachment.jpg",
                content: Buffer.from(base64Content, 'base64')
            });
        }

        // 7. Send the Email
        await transporter.sendMail({
            from: '"Leave System" <KDT3test@gmail.com>',
            to: recipientEmail,
            subject: `Leave Request: ${data.employeeName}`,
            text: `Form submitted for ${data.employeeName} regarding ${data.shift} shift.`,
            attachments: emailAttachments
        });

        res.status(200).send("Form processed successfully");

    } catch (e) {
        console.error("Submission Error:", e);
        res.status(500).send("Server Error: " + e.message);
    }
});


const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
    console.log(`Server is running on port ${port}`);
});




