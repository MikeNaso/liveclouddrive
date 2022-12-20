const fs=require('fs')
const axios=require('axios')
const getConfig = require("./config.js");
const open = require('open')
const killable = require('killable');
const http = require('http');


async function getToken( callback )
{
    var tokens={}
    await fs.access("store_tokens.json", fs.F_OK, (err) => {
        if (err || tokens.access_token=='') {
            tokens = JSON.stringify({access_token: "", refresh_token: ""});
            fs.writeFileSync("store_tokens.json",tokens)
            authorize( callback )
            console.error(err)
            return
        }
        var rawdata= fs.readFileSync('store_tokens.json')
        tokens = JSON.parse(rawdata);
        // Here we should change using the timestamp and the expiration time to doit only if needed
        refreshToken( tokens, callback )
      })
}

async function readToken(code)
{
    console.log(getConfig.baseAuthUrl+getConfig.msToken)
    axios.request({
        url: getConfig.msToken,
        baseURL: getConfig.baseAuthUrl,
        method: 'post',
        data: {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: getConfig.redirect,
            client_id: getConfig.client_id,
            client_secret: getConfig.client_secret,
        },
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    })
    .then((res)=>{
        console.log("SAVE")
        // console.log( res.data)
        let obj={access_token: res.data.access_token, refresh_token: res.data.refresh_token}
        let tokens = JSON.stringify( obj );
        fs.writeFileSync("store_tokens.json",tokens)
        return obj
    })
    .catch( (err)=>{
        // console.log("ERRR")
        // console.log( err)
        // This should be modify
        // authorize()
    })
}

async function refreshToken(tokens, callback)
{
    console.log( "Refresh Token")

    axios.request({
        url: getConfig.msAuth+'Token',
        baseURL:  getConfig.baseAuthUrl,
        method: 'post',
        data: {
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
            redirect_uri: getConfig.redirect,
            client_id: getConfig.client_id,
            client_secret: getConfig.client_secret,
        },
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }).then( (response)=>{
        if( 200==response.request.res.statusCode)
        {
            let obj = {access_token: response.data.access_token, refresh_token: response.data.refresh_token}
            let tokens = JSON.stringify( obj );
            fs.writeFileSync("store_tokens.json",tokens)
            callback( obj )
        }
    })
    .catch( (err)=>{
        authorize( callback )
    })
}

async function authorize( callback )
{   
    console.log("Authorize")
    const URI=getConfig.baseAuthUrl+getConfig.msAuth+'authorize?client_id='+getConfig.client_id+'&scope='+getConfig.scope+'&response_type=code&redirect_uri='+getConfig.redirect
    // console.log( URI )
    open(URI)

    var server=http.createServer(function (req, res) {
        var code=req.url.match(/code=([^&]+)/m)
        if( code )
        {
            // We should write something more meaningfull
            res.write('OK!'); //write a response to the client
            res.end(); //end the response
            readToken( code[1], callback )
            // server.kill()
            server.close()
        }
        else {
            res.write('Wrong info');
            res.end(); 
        }
    }).listen(80); 
}

module.exports = {
    getToken,
}