const panService = require('./src/services/panService');
require('dotenv').config();

async function test() {
    try {
        console.log("Testing createPanRequest...");
        const result = await panService.createPanRequest("test@example.com", "JRRPK4256H", "2001-09-15");
        console.log("Result:", result);
    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }
    }
}

test();
