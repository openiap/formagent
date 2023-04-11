const { openiap } = require("@openiap/nodeapi");
async function main() {
    var client = new openiap();
    await client.connect();
    // Define this as a form workflow, this is what list's this workflow/form under "Form workflows"
    // you MUST update agentworkflow if testing this toward app.openiap.io 
    var workflow = {
        queue: "agentworkflow",
        name: "Agent test workflow",
        _type: "workflow",
        web: true, rpa:false
    }
    // Insert or update the workflow definition, using the queue name as uniqeness. This will ensure that we only have one workflow with this queue name.
    workflow = await client.InsertOrUpdateOne({collectionname: "workflow", item: workflow, uniqeness: "queue"});
    var localqueue = await client.RegisterQueue({ queuename:workflow.queue}, async (msg, payload, user, jwt)=> {
        var instance = {workflow: workflow._id, targetid: user._id, state: "idle", form: "63d3d8ca5f097deb21fb06de", "name": workflow.name, "_type": "instance"};
        try {
            // console.log("msg: " + JSON.stringify(msg));
            console.log("payload: " + JSON.stringify(payload));
            if(payload._id != null && payload._id != ""){
                var list = await client.Query({collectionname: "workflow_instances", query: {_id: payload._id}, jwt});
                if(list.length == 0) throw new Error("Instance " + payload._id + " not found");
                instance = list[0];
            } else {
                // STATES: new idle completed failed processing
                instance.state = "new"
                instance = await client.InsertOne({collectionname: "workflow_instances", item: instance, jwt});
            }
            if(instance.payload == null) instance.payload = {};
            instance.payload._id = instance._id // Ensure form rendere knows the instance id
            if(payload.submitbutton != null && payload.submitbutton != ""){
                // We update the text filed with some random text and set state to idle
                instance.payload.text = "Send message to queue " + payload.submitbutton + " at " + new Date().toISOString();
                instance.state = "idle"
                await client.UpdateOne({collectionname: "workflow_instances", item: instance, jwt});
                // notify web user about the updated state. If wha we do is short lived we could use "processing" state instead.
                await client.QueueMessage({queuename: msg.replyto, data: instance, jwt});

                // Do something, while the user waits 
                // For testing purposes, we can also send a message to another agent or robot, and return the result to the user
                // var result = await client.QueueMessage({queuename: payload.submitbutton, data: {sloifid},  jwt}, true);
                // if(result == null || result == "") {
                //     instance.payload.text += " - Result was null";
                // } else {
                //     instance.payload.text += " - Result was " + result;
                // }

                // We are done, set state to completed. The web user gets notifed by the return value, so we do not need to send a queue message here
                instance.state = "completed"
                await client.UpdateOne({collectionname: "workflow_instances", item: instance, jwt});
            } else {
                if(instance.payload.text == null || instance.payload.text == "") 
                instance.payload.text = "Random text goes here, at " + new Date().toISOString(); // Update a text filed on the form
                await client.UpdateOne({collectionname: "workflow_instances", item: instance, jwt});
            }
            // return payload to notify calling web user. We don't use this right now, but maybe at some point we will, to save database round trips.
            return instance.payload;
        } catch (error) {
            console.error(error);
            var e = {"error": {"message": error.message}};
            if(instance != null && instance._id != null && instance._id != ""){
                instance.state = "failed";
                instance.error = error.message;
                try {
                    await client.UpdateOne({collectionname: "workflow_instances", item: instance});
                } catch (error) {
                }
            }
            return {...e, "payload": e}
        }
    })
    console.log("listening on " + localqueue);
}
main();