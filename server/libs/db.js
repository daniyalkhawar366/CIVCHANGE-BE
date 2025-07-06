import mongoose from "mongoose";

const DbCon=async()=>{
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI)
            console.log('Mongodb is connected')
        } else {
            console.log('MongoDB URI not provided - running without database')
        }
    } catch (error) {
        console.log('mongodb connection error',error)
        console.log('Continuing without database connection...')
    }
}
export default DbCon 