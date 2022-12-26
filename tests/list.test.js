const onedrive=require("../onedrive-c")
require('console-stamp')(console, 'HH:MM:ss.l');
var tape = require('tape');

function readTree(t)
{
  onedrive.ODInterface(
      onedrive.buildTreeDelta, {nextURI: "", extra: "", cache:true}, (res)=>{
        console.log('CB ',res)
        // console.log( t )
        if( res==200)
        {
          t.ok(1,'*** First tree ok')
          uploadFile(t)
        }
        else
          t.fail("*** No capable to read the tree")
      }
    )
    
}

function uploadFile(t)
{
  onedrive.ODInterface(
    onedrive.msUploadFile, {tpmName: "tests/test_file.upload", path:'this_is_from_test.txt'}, (res)=>{
      console.log( res )
      if( res==200 || res==201 || res==202)
      {
        t.ok(2,'*** Upload file done')
        refreshTree(t)
      }
      else
        t.fail('*** Failed to upload')
    })
}

function refreshTree(t)
{
  onedrive.ODInterface(onedrive.buildTreeDelta,
    {nextURI: "", extra: onedrive._lastChecked.toISOString(), cache: true}, (err)=>{ 
      onedrive._lastChecked=new Date(); 
      t.ok(3,"*** Riuscito refresh tree")
      _dir=onedrive.findDir('/this_is_from_test.txt', onedrive._structure, true);
      if( _dir==false)
        console.log("NNNNNN")
      else if( 'this_is_from_test.txt' in _dir.files )
      {
        console.log(_dir.files['this_is_from_test.txt']['id'])
        t.ok(4,'*** The file is in onedrive')
        moveFile(t,{optsitemId: _dir.files['this_is_from_test.txt']['id'], destPath: '/OverLeaf/SUB01/SUB0101/SUB000'} )
      }
      else
      {
        t.fail(4,"*** Didn't find the file uploaded")
      }
      // console.log(_dir)
    } 
  )
}

function moveFile(t,opts)
{
  onedrive.ODInterface(onedrive.msUpdateProperties,
    opts, (err)=>{ 
      onedrive._lastChecked=new Date(); 
    })
}
tape('teardown', function(t) {
  t.plan(4)
  readTree(t)
});


