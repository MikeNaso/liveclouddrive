const fs=require('fs')
const axios=require('axios')
const getConfig = require("./config.js");
const open = require('open')
const killable = require('killable');
const http = require('http');

async function getToken(code)
{
    const URI_TOKEN=getConfig.loginUrl+'token'

    axios.request({
        url: "/common/oauth2/v2.0/token",
        baseURL: "https://login.microsoftonline.com/",
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
        let tokens = JSON.stringify({access_token: res.data.access_token, refresh_token: res.data.refresh_token});
        fs.writeFileSync("store_tokens.json",tokens)
        return tokens
    })
    .catch( (err)=>{
        console.log( err)

    })
}

async function refreshToken(cb)
{
    console.log( "Refresh 1")
    let rawdata= fs.readFileSync('store_tokens.json')
    let tokens = JSON.parse(rawdata);

    axios.request({
        url: "/common/oauth2/v2.0/token",
        baseURL: "https://login.microsoftonline.com/",
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
        // console.log( response)
        if( 200==response.request.res.statusCode)
        {
            // console.log(response.data)
            let tokens = JSON.stringify({access_token: response.data.access_token, refresh_token: response.data.refresh_token});
            fs.writeFileSync("store_tokens.json",tokens)
            cb(0)
        }
    })
    .catch( (err)=>{
        console.log("ERR")
        console.log( err.response.status)
        authorize()
        // console.log( err.response.statusCode )
        // 400 Wrong
    })
}

async function authorize()
{
    const URI=getConfig.loginUrl+'authorize?client_id='+getConfig.client_id+'&scope='+getConfig.scope+'&response_type=code&redirect_uri='+getConfig.redirect

    open(URI)

    var server=http.createServer(function (req, res) {
        var code=req.url.match(/code=([^&]+)/m)
        if( code )
        {
            res.write('OK!'); //write a response to the client
            res.end(); //end the response
            getToken( code[1] )
            // server.kill()
            server.close()
        }
        else {
            res.write('Wrong info');
            res.end(); 
        }
    }).listen(80); 
}

// async () => res = await refresh()
// var form = new FormData();
// form.append('grant_type', 'refresh_token');
// form.append('refresh_token', tokens.refresh_token );
// form.append('redirect_uri', getConfig.redirect);
// form.append('client_id',  getConfig.client_id);
// form.append('client_secret', getConfig.client_secret);

// got.post(getConfig.loginUrl+"token",{body: form,responseType: 'json'}).then((res)=>{
//     let tokens = JSON.stringify({access_token: res.body.access_token, refresh_token: res.body.refresh_token});
//     fs.writeFileSync("store_tokens.json",tokens)
// //   console.log( res)
// }).catch(err => {
//     fs.writeFileSync("store_tokens.json",JSON.stringify({access_token: "", refresh_token: ""}))
//     authorize()
// });
// console.log( "Refresh 2")
module.exports = {
    refreshToken,
}