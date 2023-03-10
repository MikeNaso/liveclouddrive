const getConfig = require("./config.js");
const fs=require('fs')
const ms=require('./graph-autentication')
const axios=require('axios')
const { Interface } = require("readline");

var _retries=0
const URI='https://graph.microsoft.com/v1.0/me/drive/root/children'

//https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0&tabs=http

class Folder {
    constructor(_value) {
        var value={}
        if( typeof(_value)!=="object")
            value={name: _value, size:0, id:-1, fileSystemInfo:{lastModifiedDateTime: new Date(),createdDateTime: new Date()}}
        else
            value=_value
      this.name = value['name'];
      this.folders = {};
      this.files={};
      this.mtime= new Date(value['fileSystemInfo']['lastModifiedDateTime']);
      this.ctime= new Date(value['fileSystemInfo']['createdDateTime']);
      this.atime= new Date();
      this.mode= 16877;
      this.nlink= 1;
      this.size= value['size'];
      this.uid= process.getuid ? process.getuid() : 0;
      this.gid= process.getgid ? process.getgid() : 0;
      this.id= value['id'];
    }
  }

class File {
    constructor(value)
    {
        this.name=value['name'];
        this.time= new Date();
        this.atime= new Date();
        this.mtime= new Date(value['fileSystemInfo']['lastModifiedDateTime']);
        this.ctime= new Date(value['fileSystemInfo']['createdDateTime']);
        this.nlink= 1;
        this.size= value['size'];
        this.mode= 33188;
        this.uid= process.getuid ? process.getuid() : 0;
        this.gid= process.getgid ? process.getgid() : 0;
        this.id= value['id'];
    }
}

let _structure=new Folder('/')
let _elementById=[]
let _lastChecked=new Date()

function findDir( path, _struct, showPartial=true ) // -1 No Looking for the right one //1 Accept any partial //2 Accept the second to last
{
    _path=path.split('/')
    _path.shift()
    _dir=_struct
    // console.log( _path.length)
    for( var b in _path)
    {
        // console.log( b, _path[b] )
        if( _path[b]!='' )
        {
            if(_path[b] in _dir.folders)
                _dir=_dir.folders[_path[b]]
            else if(b==(_path.length-1) && showPartial===2)
                return _dir
            else if( showPartial===-1 || showPartial===2)
                return null
        }
        else
        {
            if( showPartial==false)
                return null;
            break;
        }
    }
  return _dir
}

async function msUploadFile(opts, cb)
{
    // Create Session
    console.log("msUploadFile")
    await msCreateSession(opts, function( expiration, nextExp, url){
        var readStream = fs.createReadStream(opts.tpmName) 
        var data=[];
        var pos=0;
        readStream.on('data', function(chunk) {
            data.push( chunk);
        }).on('end', function() {
            console.log( "END Reading Stream")
            var buf=Buffer.concat(data);
            var _to=0;
            if( buf.length>65536)
                _to=65536;
            else
                _to=buf.length;
            msUploadBySession( url, 0, _to, buf, function(r){
                if( r.status==200 || r.status==201 || r.status==202)
                {
                    console.log('Upload File Done',r.status)
                    cb(r.status)
                }
                else 
                    cb(r.status)
            } );
            });

    })
}

async function msUploadBySession( uri, posFrom, posTo, fullbuf, callback)
{
    console.log( "msUploadBySession")
    var size=fullbuf.length
    var chunk=fullbuf.slice(posFrom,posTo)
    // console.log("************ Pos %s Len %s Size %s ",posFrom,posTo,size)
    // console.log( 'bytes ',(posFrom+'-'+(posFrom+chunk.length-1)+'/'+size) )
    
    // console.log( 'Chunk size ',chunk.length)
    await axios.request({
        baseURL: uri,
        method: 'put',
        headers: {
            "Content-Length": chunk.length,
            "Content-Range": 'bytes '+posFrom+'-'+(posFrom+chunk.length-1)+'/'+size,
        },      
        data: chunk
    }).
    then( (res)=>{
        console.log("Sent ",posFrom)
        
        if( 'nextExpectedRanges' in res.data)
        {
            var nextChunk=res.data.nextExpectedRanges[0].split('-')
            nextChunk[0]=parseInt(nextChunk[0])
            nextChunk[1]=parseInt(nextChunk[1])
            msUploadBySession( uri, nextChunk[0], (nextChunk[1]+1),fullbuf, function(r){
                // console.log('DONE 1 ',r.status)
                callback(r)
            } )
        }
        return callback(res)
    })
    .catch( (err) =>{
        console.log( err.status)
        if( 'response' in err && 'data' in err.response)
            console.log( err.response.data)
        else console.log( err)
        callback("ERRO")
    })
}


async function msCreateSession(opts, callback)
{
    console.log("msCreateSession "+opts.path)

    await axios.request({
        url: `me/drive/items/root:/${ opts.path }:/createUploadSession`,
        baseURL: getConfig.apiUrl,
        method: 'post',
        headers: { 
            Authorization: "Bearer "+opts.tokens.access_token,
            "Content-Type": "application/json"
        },
    })
    .then( (res) =>{
        callback(res.data.expirationDateTime,  res.data.nextExpectedRanges,res.data.uploadUrl )
    })
    .catch( (err)=>{
        console.log( err.response.status )
        console.log( err.response.data )
    })
}

async function msUnlink( opts, callback)
{
    console.log("msUnlink")
    await axios.request({
        url: `me/drive/items/${ opts.itemId }`,
        baseURL: getConfig.apiUrl,
        method: 'DELETE',
        headers: { 
            Authorization: "Bearer "+opts.tokens.access_token,
            "Content-Type": "application/json"
        }
    })
    .then( (res) =>
        callback( 204 )
    )
    .catch( (err)=>
        callback( 400 )
    )
}

async function msUpdateProperties( opts, callback)
{
    console.log("msUpdateProperties ");
    // Find id is it was not given
    if( opts.itemID=='' && opts.oriPath!='')
    {
        var _dir=findDir(opts.oriPath, _structure, true)
        if( opts.oriPath in _dir.files)
            opts.itemId=_dir.files[opts.oriPath]
        else if( opts.oriPath in _dir.folders)
           opts.itemId=_dir.folder[opts.oriPath]
        else
            return callback(404)
    }
    if( opts.destPath!='') {
        _path=opts.destPath.split('/')
        
        var _dir=findDir(opts.destPath, _structure, (_path.at(-1)==''?-1:2));
        console.log( 'Analize DestPath ', opts.destPath)
        _path=opts.destPath.split('/')
        if( _dir ===null)
            console.log("Not found")
        else
        {
            console.log("Found something")
            // console.log( _dir )
        }
        console.log( opts.destPath.split('/'))
        console.log( opts.destPath.split('/').pop())
    }
}

async function msDownloadPartial( opts, callback)
{
    console.log("msDownloadPartial ");
    if( opts.range!='') 
        _body={headers: {Range: 'bytes='+opts.range},responseType: 'arraybuffer'}

    console.log( "Range ",opts.range)
    await axios.get(opts.uri, _body)
    .then( 
        (res) => { 
            callback('200',res.data)
        }
    )
    .catch ( (err) =>{
        callback('400','Sd')
    })
}

async function msDownload( opts, callback)
{
    _paths=opts.path.split('/')
    _file=_paths.pop()
    _dir=_structure
    _notFound=false
    _itemId=''
    for( var b in _paths)
    {
      if(b==0)
      {
        continue
      }
      if( _paths[b]!='' )
      {
        if(_paths[b] in _dir.folders)
        {
          _dir=_dir.folders[_paths[b]]
        }
        else{
          console.log("NOT FOUND!!!! "+_paths[b])
          _notFound=true
          break;
        }
      }
    }
    if( ! _notFound)
    {
        // console.log( _dir.files[_file])
        if( _file in _dir.files)
        {
            if( 'new' in _dir.files[_file] )
            {
                return callback(404,'')
            }
            _itemId=_dir.files[_file]['id']
        }
    }
    else 
        console.log( _dir)
    
    _URI=getConfig.apiUrl+'me/drive/items/'+_itemId+'?select=id,@microsoft.graph.downloadUrl'
    await axios.get(_URI, {    
        responseType: "json",
        headers: {"Authorization": "Bearer "+opts.tokens.access_token}
    })
    .then( (res) =>{
        if( '@microsoft.graph.downloadUrl' in res.data)
            callback('200', res.data['@microsoft.graph.downloadUrl'])
        else
        {
            console.log('MSDownload concluded')
            callback("400","")
        }
    })
    .catch( (err)=>{
        if( err.response==401)
            console.log("*********** RENEW TOKEN!!!!!") 
        else
            console.log( err);
        
        callback(err.response,'')
    })
    // return response
}

async function buildTreeDelta( opts, callback )
{
    console.log( 'Build tree')
    if( 'cache' in opts && opts.cache==true && 
    (! 'nextURI' in opts || opts.nextURI=='') && 
    (! 'extra' in opts || opts.extra=='') )
    {
        console.log("Reading from cache")
        try{
            var statsObj=fs.statSync('cache/cache_tree_onedrive.cache')
            var _dt=new Date( statsObj.mtime );
            opts.extra=_dt.toISOString()
            // console.log("Readed cache")
        }
        catch(e)
        {
            // console.log(e)
        }
    }
    // console.log( opts)
    if( opts.nextURI=='')
    {
        opts.nextURI=getConfig.apiUrl+'me/drive/items/root/delta'
        if( opts.extra!='')
            opts.nextURI+='?token='+encodeURI(opts.extra)
    }

    await axios.request(
    {   
        method:'get',
        url: opts.nextURI, 
        responseType: "json",
        headers: {"Authorization": "Bearer "+opts.tokens.access_token}
    })
    .then(  async (res)=>{ 
        var _list=[];
        _nextLink='';
        if( "@odata.nextLink" in res.data)
            _nextLink=res.data['@odata.nextLink'];
        for( var i in res.data.value )
        {
            if( res.data.value[i]['parentReference']['path']===undefined)
                continue
            
            _path=res.data.value[i]['parentReference']['path'].split(':')
            _path=_path[1].split('/')

            _dir=_structure
            _path.shift()
            for( var p in _path)
            {
                r=_path[p]
                if( r in _dir.folders)
                    _dir=_dir.folders[r]
                else{
                    _dir.folders[r]=new Folder(r)
                    _dir=_dir.folders[r]
                }
            }
            if( 'folder' in res.data.value[i])
            {
                if( res.data.value[i]['name'] in _dir.folders )
                {
                    _f=_dir.folders[res.data.value[i]['name']];
                    _f.size=res.data.value[i]['size'];
                    _f.id=res.data.value[i]['id'];
                }
                else
                    _dir.folders[res.data.value[i]['name']]=new Folder(res.data.value[i]);
                
            }
            if( 'deleted'  in  res.data.value[i] ){
                console.log( "Deleted you should remove it "+ res.data.value[i] )
            }
            else if( 'file' in  res.data.value[i])
            {
                // If file exist you need to update it
                if( res.data.value[i]['id'] in _elementById)
                {
                    // If the name is chaged you need to change also in the _dir
                    if( _elementById[res.data.value[i]['id']] != res.data.value[i]['name'])
                    {
                        if( _elementById[res.data.value[i]['id']]['name'] in _dir.files)
                        {
                            _name=_elementById[res.data.value[i]['id']]['name'];
                            delete _dir.files[_name];
                            _elementById[res.data.value[i]['id']].name=res.data.value[i]['name'];
                            _dir.files[res.data.value[i]['name']]=_elementById[res.data.value[i]['id']];
                        }
                        _elementById[res.data.value[i]['id']].size=res.data.value[i]['size'];
                        _elementById[res.data.value[i]['id']].mtime= new Date(res.data.value[i]['fileSystemInfo']['lastModifiedDateTime']);
                    }
                }
                else {
                    _dir.files[res.data.value[i]['name']]=new File(res.data.value[i]);
                    _elementById[res.data.value[i]['id']]=_dir.files[res.data.value[i]['name']];
                }
            }
            else if( 'folders')
                _elementById[res.data.value[i]['id']]=_dir.files[res.data.value[i]['name']];
            
        }
        // console.log( JSON.stringify(_dir) )
        if( _nextLink!='')
        {
            opts.nextURI=_nextLink;
            opts.extra="";
            // console.log("DDD")
            await buildTreeDelta( opts, callback )
        }
        else{
            // console.log( JSON.stringify(_structure) )
            if( 'cache' in opts && opts.cache==true)
                fs.writeFileSync('cache/cache_tree_onedrive.cache', JSON.stringify(_structure) )
            callback( 200)
        }
    }).catch( err=>{
        if( 'response' in err && err.response.status==401)
            console.log("*********** RENEW TOKEN!!!!!") 
        else
            console.log( err)
    })
}


async function ODInterface(callf, opts, cb )
{
    console.log('Interface')
    await ms.getToken( async (token)=>{
        opts.tokens=token;
        await callf(opts, cb);
    })
    // callf(opts, cb)
}

module.exports = {
    ODInterface, 
    buildTreeDelta,
    msDownload,
    msDownloadPartial,
    findDir,
    msCreateSession,
    msUploadBySession,
    msUnlink,
    msUploadFile,
    msUpdateProperties,
    Folder,
    // getStream,
    _elementById,
    _structure,
    _lastChecked
}