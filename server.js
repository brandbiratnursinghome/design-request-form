import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (the form)
app.use(express.static(path.join(process.cwd(), 'public')));

// Where uploaded files go temporarily
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 15 * 1024 * 1024, // per-file hard limit (still also check total on client)
  },
});

function required(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

app.post('/api/submit', upload.array('attachments', 10), async (req, res) => {
  // Basic server-side validation
  const b = req.body || {};
  const requiredFields = ['name', 'department', 'position', 'organization', 'mobile', 'email', 'submissionDate', 'projectTitle', 'description', 'objective', 'dimensions'];
  for (const f of requiredFields) {
    if (!required(b[f])) {
      return res.status(400).json({ message: `Missing required field: ${f}` });
    }
  }
  if (!b.approvalConfirm) {
    return res.status(400).json({ message: 'Please confirm content approval.' });
  }

  // Total attachment size safety check (max 15MB total)
  const files = req.files || [];
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalSize > 15 * 1024 * 1024) {
    // cleanup
    for (const f of files) fs.unlink(f.path, () => {});
    return res.status(400).json({ message: 'Attachments exceed 15 MB total.' });
  }

  try {
    // Transporter using Gmail (recommended: App Password)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const toEmail = 'brand.biratnursinghome@gmail.com';

    const subject = `New Design Request: ${b.projectTitle} — ${b.name}`;

    const lines = [
      `Requester Information`,
      `- Name: ${b.name}`,
      `- Department: ${b.department}`,
      `- Position: ${b.position}`,
      `- Organization: ${b.organization}`,
      `- Mobile: ${b.mobile}`,
      `- Email: ${b.email}`,
      `- Date of Submission: ${b.submissionDate}`,
      ``,
      `Project Details`,
      `- Project Title: ${b.projectTitle}`,
      `- Description: ${b.description}`,
      `- Objective: ${b.objective}`,
      ``,
      `Design Specifications`,
      `- Dimensions / Quantity: ${b.dimensions}`,
      `- Preferred Color Scheme: ${b.colorScheme || '(not provided)'}`,
      `- Location / Use: ${b.locationUse || '(not provided)'}`,
      ``,
      `Additional Requirements`,
      `- Do’s & Don’ts: ${b.additional || '(not provided)'}`,
      ``,
      `Approval & Feedback`,
      `- Approval Process: ${b.approvalProcess || '(not provided)'}`,
      `- Feedback Management: ${b.feedback || '(not provided)'}`,
      ``,
      `Content Approval Confirmation: YES`,
    ];

    const attachments = files.map((f) => ({
      filename: f.originalname,
      path: f.path,
    }));

    await transporter.sendMail({
      from: `"Design Request Form" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      replyTo: b.email, // so Brand & Media can reply to requester easily
      subject,
      text: lines.join('\n'),
      attachments,
    });

    // cleanup uploaded files after emailing
    for (const f of files) fs.unlink(f.path, () => {});

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    // cleanup in case of error too
    for (const f of (req.files || [])) fs.unlink(f.path, () => {});
    return res.status(500).json({ message: 'Server error sending email. Check server logs and email credentials.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
