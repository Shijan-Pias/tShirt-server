const fs = require('fs');
const fileName = 'firebase_admin_key.json'; 

try {
    if (!fs.existsSync(fileName)) {
        process.exit(1);
    }
    const fileData = fs.readFileSync(fileName);
    const base64String = fileData.toString('base64');
    console.log(`FB_service_Key=${base64String}`);

} catch (error) {
    console.error("Error converting file:", error);
}