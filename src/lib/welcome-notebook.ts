// Welcome demo notebook content and one-time rollout to all users.

export const WELCOME_ROLLOUT_VERSION = '2026-05-28';
export const WELCOME_ROLLOUT_KEY = 'ezwrite-welcome-rollout';
export const WELCOME_PROJECT_ID = 'ezwrite-welcome-demo';

export const WELCOME_PROJECT_TITLE = 'relabel me by double-clicking';
export const WELCOME_PROJECT_PAGES = [
`hi.

i am evan.

a while back, i had a masters thesis ahead of me and not a lot of time.
the exisiting tools were no good, and writing was a slog with a million visual distractions.
it was a battle of point sizes, typefaces, headings, and colours.
born out of that, and plenty iterations here we are. ezwrite.

i've stripped the page of all visual cues drawing your attention away from your flow of thoughts,
while also integrating just the necessary tools to help. 
it's also built in a way that you model it around you.

this is going to be the final boss of your thoughts manifested into words. 
just you and your thoughts.

i hope you like it. 

evan.


[ hit cmd + → if on a mac ]
[ hit ctrl + → if on a windows ]`,
`i'm going to run you through key parts of ezwrite.
just follow along, and i recommend trying everything out when prompted.

first, a mental model of how ezwrite works.

there are notebooks, and each notebook has infinite pages.

you're on a page right now. 
to navigate pages within a notebook,
you simply swipe to the right with 2 finger,
or like earlier you hit the cmd/ctrl + ←→

go on and try it now.`,
`delete this page by hitting
cmd/ctrl + d

undo page deletions with cmd/ctrl+z`,
`okay, so now that you've got pages let's move on to notebooks.

to navigate notebooks,
you type /sidetab ( or /5) on a new line, go on and try it on the next line.


you can also hit the chevron (<) on the top right for this.`,
`important stuff.
your notes should stay just yours, and so storage is local-first.

to pick your directory (i recommend you do this right away), type in /settings (or /8).
navigate to the storage tab, and pick your local folder.


now that you've sorted out local storage, let's move on to the cloud. while ezwrite is primarily local, there is the option of syncing it across your devices.
a unique key is derived from the username + password that you put in, and your notes are encrypted on-device even before being sent out.
as a consequence of this, if you lose your username + password combo i cannot help with retrieving your notes.

navigate back to the settings window, and type in a username + password.


you choose which notebooks you want to sync.
now again navigate to the notebooks (in the sidetab), and right-click this demo notebook to sync (make sure to first initialize your username + pw).


also on ezwrite mobile, notes are synced by default as browsers auto wipe data (ie, no local storage).
so until the native app comes out, the mobile version will be strictly cloud-based.
once done with this walkthrough, login in on your mobile.`,
`cool stuff now.
there are couple what i consider neccessities that i've integrated in here.

these are the available /commands.
for now.`,
`/timer 
type in /timer (or /3) in the line underneath (and hit enter). that is a stopwatch to track time spent working.

type in /timer 25. that is a timer for 25 minutes (type in /timer, hit enter and then enter your numbers).

type in /timer 15:30. that is a timer until 3:30pm (type in /timer, hit enter and then enter your numbers).

type in /timer 45 15. this is a custom pomodoro timer for 45 min work + 15 min break. 
swap out the numbers for whatever works for you (type in /timer, hit enter and then enter your numbers).`,
`/image
type in /image (or /4) in the line underneath and pick a random image.


add a caption, resize the image with handlers at the bottom right, and move the image within the frame by double-clicking your img.`,
`/list
type in /list (or /1) in the following line to create a task list.

rename the list by clicking on the title
complete tasks by clicking the checkbox
or complete tasks by adding a "/x" at the end of the task line
indent this line with tab to create a sub-task
move this task up in priority by hitting cmd/ctrl + ↑ ↓
line
the moving of lines with cmd/ctrl + ↑ ↓ is not limited to the /list function, it works everywhere. for example, practise it on this line by moving it down (type in cmd/ctrl + ↓ arrow).
note`,
`/line
okay easy one this.
just type /line (or /2)

fin.`,
`/scratchpad
this one needs some explaining.
1/ throwback to when you were working on a piece with plenty references and links, couple months down the line and you can't seem to recall what your references where.
2/ you are using some reference material. so you copy some text on to your editor to further edit it. and now, you can't tell which ones your writing and which one the ref material is. 

well, you can do better than that.

/scratchpad is an integrated side notes tab, that doesn't contaminate your main editor. stays there on the side for when you need it.
this is not exported with the main note, it is stored separately in the local repo.

try typing in /scratchpad (or /6) on the line underneath and resize the panel to your liking.

> three /commands work in the scratchpad as well. ie, /list, /timer, and /line.
> select this placeholder text underneath and hit the floating icon that pops up. you could also hit cmd/ctrl+shift+m. (these work even with the scratchpad collapsed)
>> Sint elit aute commodo anim incididunt non. Non et mollit reprehenderit reprehenderit velit nisi tempor Lorem. Amet labore occaecat deserunt ut. Non veniam pariatur Lorem incididunt consequat. Ut aliqua deserunt officia proident. Aliqua cupidatat adipisicing occaecat quis quis in est ex. Incididunt irure mollit excepteur amet sint irure cillum laborum adipisicing pariatur fugiat incididunt duis labore laboris. Pariatur officia qui cillum.

> now make edits in the scratchpad, select the text there, and hit cmd/ctrl+shift+m to move it back to your main editor.
you can either move (like the cmd/ctrl+x  cut function) the text back and forth, or you can just copy them back and forth.
this can be toggled in /settings. `,
`# export
some of y'all write for a living. 
and how cool would it be to export ready to post notes.

in the side tab, there are three export options.

> img export
these are linkedin and instagram ready posts (dimensions-wise).

> pdf export
you can either export the entire notebook or a single page as a pdf.

> markdown export
you can either export the entire notebook or a single page as markdown.`,
`# editing
> headers
type in # followed by a space, for a title.

type in ## followed by a space, for a sub-title.

> block quotes
type in >> for blockquotes.

> all your favourite bullets and numbered lists are auto-populated.
> all my favourite bullets (>) and numbered list (1/) are also auto-populated.
> all your brackets completions are auto-populated. dont waste time closing your brackets. you're welcome.
> personal tip, use the app on 90% browser zoom (press cmd/ctrl + +/- in your browser)

# settings
> ezwrite is built for you. you choose what to include in your /commands window (toggle this in /settings).
> check out the available themes as well.
> toggle cmd/ctrl + ←→ for people used to moving to line endings

# install as app
the native applications are being developed (for which i have no definite timeline).
if you really want an experience that's close to running an app, check out /help (or /7). 
this gives you instructions in setting it up as a quasi-application on your device.
it also summarizes most of what is in this demo.

# help
for any other issues you may have or would like to make a feature request, 
check out the report bugs + feature req button at the footer of both, the /settings and /help windows.`,
`a lot many things on ezwrite are intentionally invisible, and you get a hang of it as you use it.
i've put in quite a lot thought and time into it, and tried my best to make everything feel as frictionless as possible. 
please be patient with me wrt bugs and know i'm constantly working on it.

there are more features and ideas coming soon.
and as mentioned earlier, the native app in it's very early stages. your feedback would def help guide the future of ezwrite. 
a share with a friend would go a long way (and much appreciated), and that reception would help me decide on whether to pursue further development for ezwrite.

you can keep this project as is, if you want to come back to it later.
my mail's in the settings window as well incase you need assistance at any point of time.`,
`that is all for now.

please reach out with any thought (i'd really like that), feature requests, bugs that you run into, or just say hi @ evanbuildsstuff@gmail.com
help me help you fall in love with ezwrite. 

it's yours now.

just do things. ez.

evan.`,
`that's all bro.`,
`no really. you should seriously stop. 
it actually is all.

if you did get this far, you might as well drop me a message.
evanbuildsstuff@gmail.com`,
];
