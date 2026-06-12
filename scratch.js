const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

async function testDigio() {
  const auth = Buffer.from(process.env.DIGIO_CLIENT_ID + ':' + process.env.DIGIO_CLIENT_SECRET).toString('base64');
  
  const tinyPdfBase64 = 'JVBERi0xLjQKMSAwIG9iaiA8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUj4+IGVuZG9iaiAyIDAgb2JqIDw8L1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDE+PiBlbmRvYmogMyAwIG9iaiA8PC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL0NvbnRlbnRzIDQgMCBSPj4gZW5kb2JqIDQgMCBvYmogPDwvTGVuZ3RoIDIxPj5zdHJlYW0KQlQgL0YxIDEyIFRmIDUwIDgwMCBUZCAoSGVsbG8gV29ybGQpIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmogeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExNyAwMDAwMCBuIAowMDAwMDAwMjIwIDAwMDAwIG4gCnRyYWlsZXIgPDwvU2l6ZSA1IC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjI5MgolJUVPRgo=';
  const pdfBuffer = Buffer.from(tinyPdfBase64, 'base64');

  const form = new FormData();
  form.append('file', pdfBuffer, { filename: 'Test.pdf', contentType: 'application/pdf' });
  
  try {
    const res = await axios.post('https://api.digio.in/v2/client/document/upload', form, {
      headers: {
        'Authorization': 'Basic ' + auth,
        ...form.getHeaders()
      }
    });
    console.log('Success upload:', res.data);
  } catch (err) {
    console.error('Error upload:', err.response?.data || err.message);
  }
}
testDigio();
