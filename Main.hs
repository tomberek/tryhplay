{-#LANGUAGE OverloadedStrings, DeriveDataTypeable #-}
module Main where

import MFlow.Wai.Blaze.Html.All
import Haste.Compiler
import Data.Default
import Prelude hiding (id,div,head)
import qualified Data.List as L(head)
import qualified Data.Text as T
import qualified Data.Text.IO as TIO
import Data.String
import Data.TCache.DefaultPersistence
import Data.TCache.IndexText

import System.Directory
import qualified Data.ByteString.Lazy.Char8 as B
import Data.Typeable
import Data.Monoid
import Text.Blaze.Html5.Attributes as At hiding (step,name)
import qualified Data.Text.Lazy as TL

import Control.Shell

import Debug.Trace

(!>)= flip trace

projects= "./examples/"

data Examples= Examples [String] deriving (Read,Show,Typeable)
instance Indexable Examples where key = const "examples"
instance Serializable Examples where
  serialize = B.pack . show
  deserialize = read . B.unpack

listExamples (Examples list)= list

main1 = runNavigation "tra" . transientNav . page $ do
      command <- getString Nothing <! [("width","110")]
      let args= words command
      r <- liftIO $ shell $  genericRun (L.head args) (Prelude.tail args) ""
      b  << (show  r) ++> empty


main= do
  indexList listExamples (map TL.pack )
  examples <- atomically $ newDBRef $ Examples ["example.hs"]

  setFilesPath projects

  runNavigation "try" . transientNav $ do
    let trynumber= 3

    Examples exampleList <- liftIO $ atomically $ readDBRef examples
                         `onNothing` error "examples empty"

    page $ pageFlow "input" $ do
          example <- b  "you can load also one of these examples "
                     ++> firstOf[wlink e << e <++ " " | e <- exampleList]
                     <|> return "none"

          extext <- if example /= "none" then liftIO $ TIO.readFile $ projects ++ example else return ""

          r <- p <<< (getMultilineText extext <! [("style","width:100%;height:300")]
                        <++ br
                        <** submitButton "send"
                        <++ br)
          let haskell=  T.unpack r
              hsfile = show trynumber ++ ".hs"
          liftIO $ writeFile  (projects ++ hsfile) haskell
          r <- liftIO . shell $ inDirectory projects $ genericRun "/app/.cabal/bin/hastec" [hsfile,"--output-html"] "" !> hsfile
--          r <- p <<< do liftIO $ compile def "./" $ InString haskell

--          out <- case r of
--              Failure errs -> fromStr errs ++> empty !> ("*******Failure: "++  errs)
--              Success (OutString out) -> return out  !>  "*******SUCCESS"
          wraw $ fromStr (show r)
          case r of
            Left errs -> fromStr errs ++> empty  !> ("*******Failure: not found hastec"++  errs)
            Right (b,out,err) ->
                  case b of
                      True  -> (a  ! href  (fromString("/"++show trynumber++".html")) $ "execute") ++> empty
                      False -> fromStr err ++> empty   !> "failure"

--          p <<< submitButton  "execute"
----          let jsfile = show trynumber ++ ".js"
----          liftIO $ writeFile  (projects ++ jsfile) out
--          return (jsfile,haskell)

--    setHeader $ \w ->  docTypeHtml $ do
--        head $ script ! type_ "text/javascript" ! src (fromString $ "/"++ js) $ fromStr ""
--        body $ do
--             div ! At.style "background:gray" ! id "idelem" $ fromStr ""
--             w
--
--    page $ wform $
--       (getString Nothing <! [("placeholder","give a program name to save")])
--        `validate` (\name -> do
--          list <- liftIO $ atomically $ listExamples `containsElem`  name
--          if null list
--               then liftIO $ do
--                   writeFile  (projects ++name) hs
--                   renameFile (projects ++js) $ projects ++ name++ ".js"
--                   atomically $ writeDBRef examples $ Examples $ name:exampleList
--                   return Nothing
--               else return $ Just "name already used")
--       **> submitButton "send" **> return  ()
